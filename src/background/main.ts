import { ChromeController } from './chrome-controller';
import type { ExtensionMessage } from '../shared/types';

class BackgroundService {
  private chromeController: ChromeController;

  constructor() {
    this.chromeController = new ChromeController();
  }

  async initialize() {
    console.log('[BACKGROUND] Initializing Web Voyager Extension...');
    
    await this.chromeController.initialize();
    
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
      (async () => {
        try {
          console.log('[BACKGROUND] Received message:', message.type);
          const result = await this.handleMessage(message);
          sendResponse({ success: true, data: result });
        } catch (error) {
          console.error('[BACKGROUND] Message handling error:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })();
      return true;
    });

    this.setupChromeEventListeners();
  }

  private async handleMessage(message: ExtensionMessage): Promise<any> {
    console.log('[BACKGROUND] Handling message:', message.type);

    const currentTab = await this.chromeController.getCurrentTab();
    if (!currentTab) {
      console.warn('[BACKGROUND] No active tab found, attempting to create one');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab available');
      }
      throw new Error('No active tab found');
    }

    switch(message.type) {
      case 'CAPTURE_SCREENSHOT':
        return await currentTab.captureScreenshot();

      case 'MARK_ELEMENTS':
        const document = currentTab.getDocument();
        if (!document) throw new Error('No document found');
        const elements = await document.markElements();
        console.log(`[BACKGROUND] Returning ${elements.length} elements to sidepanel`);
        return { elements };

      case 'CLEAR_MARKERS':
        const doc = currentTab.getDocument();
        if (!doc) throw new Error('No document found');
        return await doc.clearMarkers();

      case 'EXECUTE_ACTION':
        if (!message.action) throw new Error('No action provided');
        return await currentTab.executeAction(message.action, message.elements);

      case 'GET_ELEMENTS':
        const docEl = currentTab.getDocument();
        if (!docEl) throw new Error('No document found');
        return docEl.getElements();

      default:
        throw new Error(`Unknown message type: ${(message as any).type}`);
    }
  }

  private setupChromeEventListeners() {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await this.chromeController.onTabActivated(activeInfo.tabId, activeInfo.windowId);
    });

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        await this.chromeController.onTabUpdated(tabId, tab.url);
      }
    });

    chrome.windows.onCreated.addListener(async (window) => {
      await this.chromeController.onWindowCreated(window.id!);
    });

    chrome.windows.onRemoved.addListener(async (windowId) => {
      await this.chromeController.onWindowRemoved(windowId);
    });

    chrome.debugger.onDetach.addListener((source, reason) => {
      console.log('[BACKGROUND] Debugger detached:', source, reason);
      this.chromeController.onDebuggerDetached(source.tabId!);
    });
  }
}

const backgroundService = new BackgroundService();
backgroundService.initialize().catch(console.error);

chrome.runtime.onStartup.addListener(() => {
  console.log('[BACKGROUND] Extension startup - cleaning up debugger sessions');
  chrome.debugger.getTargets((targets) => {
    targets.forEach((target) => {
      if (target.attached) {
        chrome.debugger.detach({ tabId: target.tabId });
      }
    });
  });
});