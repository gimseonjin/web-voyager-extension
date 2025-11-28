import { Tab } from './tab';

export class Browser {
  private windowId: number;
  private tabs: Map<number, Tab> = new Map();
  private activeTabId: number | null = null;

  constructor(windowId: number) {
    this.windowId = windowId;
    console.log(`[Browser] Created browser for window: ${windowId}`);
  }

  async createTab(tabId: number, url: string = ''): Promise<Tab> {
    console.log(`[Browser] Creating tab: ${tabId} with URL: ${url}`);
    
    const tab = new Tab(tabId, this, url);
    this.tabs.set(tabId, tab);
    
    try {
      await tab.initialize();
    } catch (error) {
      console.warn(`[Browser] Failed to initialize tab ${tabId}:`, error);
    }
    
    return tab;
  }

  getTab(tabId: number): Tab | null {
    return this.tabs.get(tabId) || null;
  }

  getActiveTab(): Tab | null {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId) || null;
  }

  setActiveTab(tabId: number) {
    console.log(`[Browser] Setting active tab: ${tabId}`);
    this.activeTabId = tabId;
  }

  async removeTab(tabId: number) {
    console.log(`[Browser] Removing tab: ${tabId}`);
    const tab = this.tabs.get(tabId);
    if (tab) {
      await tab.destroy();
      this.tabs.delete(tabId);
    }
    
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      if (this.tabs.size > 0) {
        const firstTab = this.tabs.values().next().value;
        if (firstTab) {
          this.activeTabId = firstTab.getTabId();
        }
      }
    }
  }

  getAllTabs(): Tab[] {
    return Array.from(this.tabs.values());
  }

  getWindowId(): number {
    return this.windowId;
  }

  async destroy() {
    console.log(`[Browser] Destroying browser: ${this.windowId}`);
    
    const destroyPromises = Array.from(this.tabs.values()).map(tab => tab.destroy());
    await Promise.allSettled(destroyPromises);
    
    this.tabs.clear();
    this.activeTabId = null;
  }

  getTabCount(): number {
    return this.tabs.size;
  }
}