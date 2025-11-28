import type { MarkedElement } from '../shared/types';

export class Document {
  private tab: any;
  private elements: MarkedElement[] = [];
  private url: string = '';
  private isMarked: boolean = false;

  constructor(tab: any) {
    this.tab = tab;
  }

  async updateUrl(url: string) {
    console.log(`[Document] URL updated: ${this.url} -> ${url}`);
    
    if (this.url !== url) {
      this.elements = [];
      this.isMarked = false;
      this.url = url;
    }
  }

  async getElements(): Promise<MarkedElement[]> {
    if (this.elements.length === 0) {
      await this.updateElements();
    }
    return this.elements;
  }

  async updateElements(): Promise<MarkedElement[]> {
    try {
      console.log(`[Document] Updating elements for tab: ${this.tab.getTabId()}`);
      
      const response = await chrome.tabs.sendMessage(this.tab.getTabId(), {
        type: 'GET_ELEMENTS'
      });

      if (response && response.elements) {
        this.elements = response.elements;
        console.log(`[Document] Found ${this.elements.length} elements`);
      } else {
        this.elements = [];
        console.warn(`[Document] No elements found in response`);
      }
      
      return this.elements;
    } catch (error) {
      console.error(`[Document] Failed to update elements:`, error);
      this.elements = [];
      return [];
    }
  }

  async markElements(): Promise<MarkedElement[]> {
    try {
      console.log(`[Document] Marking elements for tab: ${this.tab.getTabId()}`);
      
      const tab = await chrome.tabs.get(this.tab.getTabId());
      console.log(`[Document] Tab URL: ${tab?.url}`);
      if (!tab || !tab.url) {
        throw new Error('Tab not found or has no URL');
      }
      
      if (tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('moz-extension://') ||
          tab.url.startsWith('about:') ||
          tab.url === 'chrome://newtab/') {
        throw new Error(`Content scripts cannot run on ${tab.url}. Please navigate to a regular web page (http:// or https://).`);
      }
      
      console.log(`[Document] Sending MARK_ELEMENTS to tab ${this.tab.getTabId()}`);
      
      try {
        const response = await chrome.tabs.sendMessage(this.tab.getTabId(), {
          type: 'MARK_ELEMENTS'
        });
        
        console.log(`[Document] Response received:`, response);

        if (response && response.elements) {
          this.elements = response.elements;
          this.isMarked = true;
          console.log(`[Document] Marked ${this.elements.length} elements`);
          
          if (this.elements.length === 0) {
            console.warn(`[Document] No clickable elements found on this page: ${tab.url}`);
          }
        } else {
          console.warn(`[Document] No elements returned from marking`);
          this.elements = [];
        }
      } catch (messageError) {
        console.error(`[Document] Message send failed:`, messageError);
        const errorMsg = messageError instanceof Error ? messageError.message : 'Unknown error';
        throw new Error(`Content script not responding. Please refresh the page and try again. Error: ${errorMsg}`);
      }
      
      return this.elements;
    } catch (error) {
      console.error(`[Document] Failed to mark elements:`, error);
      
      if ((error as any).message?.includes('receiving end does not exist')) {
        console.log(`[Document] Content script not ready, waiting and retrying...`);
        await this.wait(1000);
        
        try {
          const retryResponse = await chrome.tabs.sendMessage(this.tab.getTabId(), {
            type: 'MARK_ELEMENTS'
          });
          
          if (retryResponse && retryResponse.elements) {
            this.elements = retryResponse.elements;
            this.isMarked = true;
            return this.elements;
          }
        } catch (retryError) {
          console.error(`[Document] Retry failed:`, retryError);
          const tab = await chrome.tabs.get(this.tab.getTabId()).catch(() => null);
          if (tab?.url) {
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
              throw new Error(`Cannot automate ${tab.url}. Please navigate to a regular web page (http:// or https://).`);
            } else {
              throw new Error(`Content script failed to load on ${tab.url}. Please refresh the page and try again.`);
            }
          } else {
            throw new Error('Tab is no longer available. Please try again.');
          }
        }
      }
      
      throw error;
    }
  }

  async clearMarkers(): Promise<void> {
    try {
      console.log(`[Document] Clearing markers for tab: ${this.tab.getTabId()}`);
      
      const tabId = this.tab.getTabId();
      
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch (tabError) {
        console.warn(`[Document] Tab ${tabId} no longer exists:`, tabError);
        this.isMarked = false;
        return;
      }
      
      if (!tab || tab.discarded || tab.status === 'unloaded') {
        console.warn(`[Document] Tab ${tabId} is not available for marker clearing (discarded: ${tab?.discarded}, status: ${tab?.status})`);
        this.isMarked = false;
        return;
      }
      
      const messagePromise = chrome.tabs.sendMessage(tabId, {
        type: 'CLEAR_MARKERS'
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3000)
      );
      
      try {
        await Promise.race([messagePromise, timeoutPromise]);
        console.log(`[Document] Markers cleared`);
      } catch (messageError) {
        console.warn(`[Document] Content script did not respond to CLEAR_MARKERS:`, messageError);
      }
      
      this.isMarked = false;
    } catch (error) {
      console.warn(`[Document] Failed to clear markers (this is usually safe to ignore):`, error);
      this.isMarked = false;
    }
  }

  getElementById(id: number): MarkedElement | null {
    return this.elements.find(el => el.id === id) || null;
  }

  getElementsByTagName(tagName: string): MarkedElement[] {
    return this.elements.filter(el => 
      el.tagName.toLowerCase() === tagName.toLowerCase()
    );
  }

  getElementsByText(text: string): MarkedElement[] {
    const searchText = text.toLowerCase();
    return this.elements.filter(el => 
      el.text.toLowerCase().includes(searchText)
    );
  }

  getUrl(): string {
    return this.url;
  }

  isPageMarked(): boolean {
    return this.isMarked;
  }

  getElementCount(): number {
    return this.elements.length;
  }

  getElementStats(): { [tagName: string]: number } {
    const stats: { [tagName: string]: number } = {};
    this.elements.forEach(el => {
      stats[el.tagName] = (stats[el.tagName] || 0) + 1;
    });
    return stats;
  }

  filterElements(filter: {
    tagNames?: string[];
    hasText?: boolean;
    minTextLength?: number;
  }): MarkedElement[] {
    return this.elements.filter(el => {
      if (filter.tagNames && !filter.tagNames.includes(el.tagName.toLowerCase())) {
        return false;
      }
      
      if (filter.hasText && !el.text.trim()) {
        return false;
      }
      
      if (filter.minTextLength && el.text.length < filter.minTextLength) {
        return false;
      }
      
      return true;
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}