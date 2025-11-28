import type { AIAction, MarkedElement, ScreenshotData } from '../shared/types';

export class CDPSession {
  private tabId: number;
  private connected: boolean = false;
  private debuggee: chrome.debugger.Debuggee;

  constructor(tabId: number) {
    this.tabId = tabId;
    this.debuggee = { tabId };
  }

  async connect(): Promise<void> {
    try {
      console.log(`[CDPSession] Connecting to tab: ${this.tabId}`);
      
      const tab = await chrome.tabs.get(this.tabId);
      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        throw new Error(`Cannot debug protected tab: ${tab?.url || 'unknown'}`);
      }
      
      await chrome.debugger.attach(this.debuggee, '1.3');
      this.connected = true;
      
      await this.sendCommand('Page.enable');
      
      console.log(`[CDPSession] Successfully connected to tab: ${this.tabId}`);
    } catch (error) {
      console.error(`[CDPSession] Failed to connect to tab ${this.tabId}:`, error);
      this.connected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        console.log(`[CDPSession] Disconnecting from tab: ${this.tabId}`);
        await chrome.debugger.detach(this.debuggee);
        this.connected = false;
      } catch (error) {
        console.error(`[CDPSession] Error disconnecting from tab ${this.tabId}:`, error);
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async captureScreenshot(): Promise<ScreenshotData> {
    if (!this.connected) {
      throw new Error('CDP session not connected');
    }

    try {
      const result = await this.sendCommand('Page.captureScreenshot', {
        format: 'png',
        quality: 80,
        captureBeyondViewport: false
      });

      return {
        data: result.data,
        width: result.width,
        height: result.height
      };
    } catch (error) {
      console.error(`[CDPSession] Screenshot capture failed:`, error);
      throw new Error(`Screenshot capture failed: ${error}`);
    }
  }

  async simulateClick(x: number, y: number): Promise<void> {
    if (!this.connected) {
      throw new Error('CDP session not connected');
    }

    try {
      console.log(`[CDPSession] Simulating click at (${x}, ${y})`);
      
      await this.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(x),
        y: Math.round(y),
        button: 'none',
        clickCount: 0
      });

      await this.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: Math.round(x),
        y: Math.round(y),
        button: 'left',
        clickCount: 1
      });

      await this.wait(50);

      await this.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: Math.round(x),
        y: Math.round(y),
        button: 'left',
        clickCount: 1
      });

      console.log(`[CDPSession] Click completed at (${x}, ${y})`);
    } catch (error) {
      console.error(`[CDPSession] Click simulation failed:`, error);
      throw new Error(`Click simulation failed: ${error}`);
    }
  }

  async simulateType(text: string): Promise<void> {
    if (!this.connected) {
      throw new Error('CDP session not connected');
    }

    try {
      console.log(`[CDPSession] Typing text: "${text}"`);
      
      await this.sendCommand('Input.insertText', { text });
      
      console.log(`[CDPSession] Typing completed`);
    } catch (error) {
      console.error(`[CDPSession] Type simulation failed:`, error);
      throw new Error(`Type simulation failed: ${error}`);
    }
  }

  async simulateScroll(direction: 'up' | 'down', amount: number = 300, x?: number, y?: number): Promise<void> {
    if (!this.connected) {
      throw new Error('CDP session not connected');
    }

    try {
      const deltaY = direction === 'down' ? amount : -amount;
      const scrollX = x !== undefined ? x : 400;
      const scrollY = y !== undefined ? y : 300;
      
      console.log(`[CDPSession] Scrolling ${direction} by ${Math.abs(deltaY)}px at position (${scrollX}, ${scrollY})`);
      
      await this.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: scrollX,
        y: scrollY,
        deltaX: 0,
        deltaY: deltaY
      });

      console.log(`[CDPSession] Scroll completed`);
    } catch (error) {
      console.error(`[CDPSession] Scroll simulation failed:`, error);
      throw new Error(`Scroll simulation failed: ${error}`);
    }
  }

  async executeAction(action: AIAction, elements?: MarkedElement[]): Promise<void> {
    console.log(`[CDPSession] Executing action:`, action);
    switch(action.type) {
      case 'click':
        if (action.elementId !== undefined && elements) {
          const element = elements.find(el => el.id === action.elementId);
          console.log(`[CDPSession] Element:`, element);
          if (!element) {
            throw new Error(`Element with id ${action.elementId} not found`);
          }

          console.log(`[CDPSession] Element rect:`, element.rect);
          
          const x = element.rect.left + element.rect.width / 2;
          const y = element.rect.top + element.rect.height / 2;
          console.log(`[CDPSession] Clicking element at (${x}, ${y})`);
          await this.simulateClick(x, y);
        } else if (action.x !== undefined && action.y !== undefined) {
          await this.simulateClick(action.x, action.y);
        } else {
          throw new Error('Click action requires either elementId or x,y coordinates');
        }
        break;

      case 'type':
        if (action.elementId && elements && action.text) {
          const element = elements.find(el => el.id === action.elementId);
          if (!element) {
            throw new Error(`Element with id ${action.elementId} not found`);
          }
          
          const x = element.rect.left + element.rect.width / 2;
          const y = element.rect.top + element.rect.height / 2;
          await this.simulateClick(x, y);
          
          await this.wait(100);
          await this.sendCommand('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Meta'
          });
          await this.sendCommand('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'a'
          });
          await this.sendCommand('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'a'
          });
          await this.sendCommand('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Meta'
          });
          
          await this.simulateType(action.text);
        } else if (action.text) {
          await this.simulateType(action.text);
        } else {
          throw new Error('Type action requires text and optionally elementId');
        }
        break;

      case 'scroll':
        if (!action.direction) {
          throw new Error('Scroll action requires direction');
        }
        
        // 특정 요소 스크롤 또는 특정 위치에서 스크롤
        if (action.elementId !== undefined && elements) {
          const element = elements.find(el => el.id === action.elementId);
          if (!element) {
            throw new Error(`Element with id ${action.elementId} not found`);
          }
          // 요소의 중앙에서 스크롤
          const x = element.rect.left + element.rect.width / 2;
          const y = element.rect.top + element.rect.height / 2;
          await this.simulateScroll(action.direction, action.amount || 300, x, y);
        } else if (action.x !== undefined && action.y !== undefined) {
          // 지정된 좌표에서 스크롤
          await this.simulateScroll(action.direction, action.amount || 300, action.x, action.y);
        } else {
          // 페이지 전체 스크롤
          await this.simulateScroll(action.direction, action.amount || 300);
        }
        break;

      case 'wait':
        const duration = action.duration || 2000;
        console.log(`[CDPSession] Waiting for ${duration}ms`);
        await this.wait(duration);
        break;

      case 'navigate':
        if (!action.url) {
          throw new Error('Navigate action requires url');
        }
        await this.sendCommand('Page.navigate', { url: action.url });
        // 페이지 로드 대기
        await this.wait(3000);
        break;

      case 'done':
        console.log(`[CDPSession] Task marked as done`);
        break;

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  private async sendCommand(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(this.debuggee, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getTabId(): number {
    return this.tabId;
  }
}