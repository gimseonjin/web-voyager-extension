import { CDPSession } from './cdp-session';
import { Document } from './document';
import type { AIAction, MarkedElement, ScreenshotData } from '../shared/types';

export class Tab {
  private tabId: number;
  private browser: any; // Browser 클래스 참조
  private document: Document | null = null;
  private cdpSession: CDPSession | null = null;
  private url: string = '';
  private isInitialized: boolean = false;

  constructor(tabId: number, browser: any, url: string = '') {
    this.tabId = tabId;
    this.browser = browser;
    this.url = url;
    console.log(`[Tab] Created tab: ${tabId} with URL: ${url}`);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log(`[Tab] Initializing tab: ${this.tabId}`);
      
      this.document = new Document(this);
      await this.document.updateUrl(this.url);
      
      this.isInitialized = true;
      
      console.log(`[Tab] Tab ${this.tabId} initialized successfully`);
    } catch (error) {
      console.error(`[Tab] Failed to initialize tab ${this.tabId}:`, error);
      throw error;
    }
  }

  private async ensureCDPConnection(): Promise<void> {
    if (!this.cdpSession || !this.cdpSession.isConnected()) {
      console.log(`[Tab] Creating CDP connection for tab: ${this.tabId}`);
      
      if (this.cdpSession) {
        await this.cdpSession.disconnect();
      }
      
      this.cdpSession = new CDPSession(this.tabId);
      await this.cdpSession.connect();
    }
  }

  async captureScreenshot(): Promise<ScreenshotData> {
    await this.ensureCDPConnection();
    if (!this.cdpSession) {
      throw new Error('CDP session not available');
    }
    
    return await this.cdpSession.captureScreenshot();
  }

  async executeAction(action: AIAction, elements?: MarkedElement[]): Promise<void> {
    await this.ensureCDPConnection();
    if (!this.cdpSession) {
      throw new Error('CDP session not available');
    }
    
    return await this.cdpSession.executeAction(action, elements);
  }

  getDocument(): Document | null {
    return this.document;
  }

  async onUrlChanged(newUrl: string): Promise<void> {
    console.log(`[Tab] URL changed: ${this.url} -> ${newUrl}`);
    this.url = newUrl;
    
    if (this.document) {
      await this.document.updateUrl(newUrl);
    }
    
    if (this.cdpSession) {
      try {
        await this.cdpSession.disconnect();
      } catch (error) {
        console.warn(`[Tab] Error disconnecting CDP session:`, error);
      }
      this.cdpSession = null;
    }
  }

  onDebuggerDetached(): void {
    console.log(`[Tab] Debugger detached from tab: ${this.tabId}`);
    if (this.cdpSession) {
      this.cdpSession = null;
    }
  }

  async destroy(): Promise<void> {
    console.log(`[Tab] Destroying tab: ${this.tabId}`);
    
    if (this.cdpSession) {
      try {
        await this.cdpSession.disconnect();
      } catch (error) {
        console.warn(`[Tab] Error disconnecting CDP during destroy:`, error);
      }
      this.cdpSession = null;
    }
    
    if (this.document) {
      try {
        await this.document.clearMarkers();
      } catch (error) {
        console.warn(`[Tab] Error clearing markers during destroy:`, error);
      }
      this.document = null;
    }
    
    this.isInitialized = false;
  }

  getTabId(): number {
    return this.tabId;
  }

  getUrl(): string {
    return this.url;
  }

  getBrowser(): any {
    return this.browser;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  isCDPConnected(): boolean {
    return this.cdpSession?.isConnected() || false;
  }

  async getTabInfo(): Promise<chrome.tabs.Tab | null> {
    try {
      return await chrome.tabs.get(this.tabId);
    } catch (error) {
      console.error(`[Tab] Failed to get tab info for ${this.tabId}:`, error);
      return null;
    }
  }

  async isActive(): Promise<boolean> {
    const tabInfo = await this.getTabInfo();
    return tabInfo?.active || false;
  }
}