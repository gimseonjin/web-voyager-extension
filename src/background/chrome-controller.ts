import { Browser } from './browser';
import { Tab } from './tab';

export class ChromeController {
  private browsers: Map<number, Browser> = new Map();
  private activeWindowId: number | null = null;

  async initialize() {
    console.log('[ChromeController] Initializing...');
    
    const windows = await chrome.windows.getAll({ populate: true });
    
    for (const window of windows) {
      if (window.id) {
        const browser = new Browser(window.id);
        this.browsers.set(window.id, browser);
        
        if (window.tabs) {
          for (const tab of window.tabs as chrome.tabs.Tab[]) {
            if (tab.id) {
              await browser.createTab(tab.id, tab.url || '');
            }
          }
        }
        
        if (window.focused) {
          this.activeWindowId = window.id;
          
          const activeTab = window.tabs?.find(tab => tab.active);
          if (activeTab?.id) {
            browser.setActiveTab(activeTab.id);
          }
        }
      }
    }

    console.log(`[ChromeController] Initialized ${this.browsers.size} browsers`);
  }

  getActiveBrowser(): Browser | null {
    if (!this.activeWindowId) return null;
    return this.browsers.get(this.activeWindowId) || null;
  }

  async getCurrentTab(): Promise<Tab | null> {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!currentTab?.id) return null;

    const browser = this.getActiveBrowser();
    if (!browser) {
      const windows = await chrome.windows.getCurrent();
      if (windows.id) {
        const newBrowser = new Browser(windows.id);
        this.browsers.set(windows.id, newBrowser);
        this.activeWindowId = windows.id;
        
        const tab = await newBrowser.createTab(currentTab.id, currentTab.url || '');
        newBrowser.setActiveTab(currentTab.id);
        return tab;
      }
      return null;
    }

    let tab = browser.getTab(currentTab.id);
    if (!tab) {
      tab = await browser.createTab(currentTab.id, currentTab.url || '');
      browser.setActiveTab(currentTab.id);
    }

    return tab;
  }

  async onWindowCreated(windowId: number) {
    console.log(`[ChromeController] Window created: ${windowId}`);
    const browser = new Browser(windowId);
    this.browsers.set(windowId, browser);
  }

  async onWindowRemoved(windowId: number) {
    console.log(`[ChromeController] Window removed: ${windowId}`);
    const browser = this.browsers.get(windowId);
    if (browser) {
      await browser.destroy();
      this.browsers.delete(windowId);
    }
    
    if (this.activeWindowId === windowId) {
      this.activeWindowId = null;
      const windows = await chrome.windows.getAll();
      const focusedWindow = windows.find((w: chrome.windows.Window) => w.focused);
      if (focusedWindow?.id) {
        this.activeWindowId = focusedWindow.id;
      }
    }
  }

  async onTabActivated(tabId: number, windowId: number) {
    console.log(`[ChromeController] Tab activated: ${tabId} in window ${windowId}`);
    
    this.activeWindowId = windowId;
    
    const browser = this.browsers.get(windowId);
    if (browser) {
      browser.setActiveTab(tabId);
      
      if (!browser.getTab(tabId)) {
        const tab = await chrome.tabs.get(tabId);
        if (tab) {
          await browser.createTab(tabId, tab.url || '');
        }
      }
    }
  }

  async onTabUpdated(tabId: number, url: string) {
    console.log(`[ChromeController] Tab updated: ${tabId} -> ${url}`);
    
    for (const browser of this.browsers.values()) {
      const tab = browser.getTab(tabId);
      if (tab) {
        await tab.onUrlChanged(url);
        break;
      }
    }
  }

  onDebuggerDetached(tabId: number) {
    console.log(`[ChromeController] Debugger detached from tab: ${tabId}`);
    
    for (const browser of this.browsers.values()) {
      const tab = browser.getTab(tabId);
      if (tab) {
        tab.onDebuggerDetached();
        break;
      }
    }
  }

  async getAllTabs(): Promise<Tab[]> {
    const allTabs: Tab[] = [];
    for (const browser of this.browsers.values()) {
      allTabs.push(...browser.getAllTabs());
    }
    return allTabs;
  }
}