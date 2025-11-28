import type { MarkedElement, ScreenshotData, AIAction, ActionResult } from '../shared/types';
import { ClaudeAPIClient, type Prediction } from './claude-api';

export interface AgentResult {
  success: boolean;
  summary: string;
  error?: string;
  steps: ActionResult[];
}

export class AgentController {
  private maxSteps = 10;
  private currentStep = 0;
  private claudeClient: ClaudeAPIClient;
  private scratchpad: string = '';
  private isRunning = false;
  private shouldStop = false;

  constructor() {
    this.claudeClient = new ClaudeAPIClient();
  }

  async runAgent(
    initialQuery: string, 
    onProgress?: (action: string) => void
  ): Promise<AgentResult> {
    console.log('[AgentController] Starting agent with query:', initialQuery);
    
    const steps: ActionResult[] = [];
    this.currentStep = 0;
    this.isRunning = true;
    this.shouldStop = false;
    let continueExecution = true;
    
    onProgress?.('스크린샷을 캡처하고 있습니다...');

    try {
      while (continueExecution && this.currentStep < this.maxSteps && !this.shouldStop) {
        this.currentStep++;
        
        console.log(`[AgentController] Step ${this.currentStep}/${this.maxSteps}`);
        
        onProgress?.(`[${this.currentStep}/${this.maxSteps}] 현재 화면을 캡처하고 있습니다...`);
        const screenshot = await this.captureScreen();
        
        onProgress?.(`[${this.currentStep}/${this.maxSteps}] 클릭 가능한 요소를 찾고 있습니다...`);
        const elements = await this.markElements();
        
        if (elements.length === 0) {
          console.warn('[AgentController] No clickable elements found');
          steps.push({
            success: false,
            message: '클릭 가능한 요소를 찾을 수 없습니다.',
            error: 'No clickable elements found'
          });
          break;
        }
        
        onProgress?.(`[${this.currentStep}/${this.maxSteps}] AI가 다음 작업을 분석하고 있습니다...`);
        const prediction = await this.claudeClient.analyzePage(screenshot, elements, initialQuery, this.scratchpad);
        const aiAction = this.convertPredictionToAction(prediction);
        
        console.log(`[AgentController] Step ${this.currentStep} AI Reasoning:`, prediction.reasoning);
        console.log(`[AgentController] Step ${this.currentStep} AI Action:`, prediction.action);
        if (prediction.args) {
          console.log(`[AgentController] Step ${this.currentStep} AI Args:`, prediction.args);
        }
        
        if (prediction.action === 'ANSWER') {
          steps.push({
            success: true,
            message: `🤖 AI 분석 결과: ${prediction.reasoning}`,
            reasoning: prediction.reasoning
          });
          continueExecution = false;
          onProgress?.('AI가 작업을 완료했습니다!');
          break;
        }
        
        onProgress?.(`[${this.currentStep}/${this.maxSteps}] ${this.getActionDescription(aiAction)}를 실행하고 있습니다...`);
        const result = await this.executeAction(aiAction, elements);
        
        result.reasoning = prediction.reasoning;
        steps.push(result);
        
        console.log(`[AgentController] Step ${this.currentStep} result:`, result);
        console.log(`[AgentController] Step ${this.currentStep} result reasoning:`, result.reasoning);
        
        this.updateScratchpad(result);
        
        if (aiAction.type === 'done') {
          continueExecution = false;
          onProgress?.('작업이 완료되었습니다!');
        } else {
          await this.clearMarkers();
          
          onProgress?.(`[${this.currentStep}/${this.maxSteps}] 페이지 로딩을 대기하고 있습니다...`);
          await this.wait(2000);
        }
      }
      
      await this.clearMarkers();
      
      if (this.shouldStop) {
        console.log('[AgentController] Agent execution stopped by user');
        return {
          success: false,
          summary: `사용자가 작업을 중단했습니다. (${this.currentStep}단계에서 중단)`,
          steps,
          error: 'User cancelled'
        };
      }
      
      const successfulSteps = steps.filter(s => s.success);
      const summary = steps.length > 0 ? 
        steps.map((s, i) => `${i + 1}. ${s.message}`).join('\n') :
        '아무 작업도 수행되지 않았습니다.';
      
      return {
        success: successfulSteps.length > 0,
        summary,
        steps,
        error: steps.find(s => !s.success)?.error
      };
      
    } catch (error) {
      console.error('[AgentController] Agent execution failed:', error);
      
      await this.clearMarkers().catch(console.warn);
      
      return {
        success: false,
        summary: '작업 실행 중 오류가 발생했습니다.',
        error: error instanceof Error ? error.message : 'Unknown error',
        steps
      };
    } finally {
      this.isRunning = false;
      this.shouldStop = false;
    }
  }

  private async captureScreen(): Promise<ScreenshotData> {
    const response = await chrome.runtime.sendMessage({ 
      type: 'CAPTURE_SCREENSHOT' 
    });
    
    if (!response || !response.success) {
      throw new Error(`Screenshot capture failed: ${response?.error || 'No response'}`);
    }
    
    return response.data;
  }

  private async markElements(): Promise<MarkedElement[]> {
    console.log('[AgentController] Sending MARK_ELEMENTS message...');
    
    const response = await chrome.runtime.sendMessage({ 
      type: 'MARK_ELEMENTS' 
    });
    
    console.log('[AgentController] MARK_ELEMENTS response:', response);
    
    if (!response) {
      throw new Error('No response from background script. Please refresh the page and try again.');
    }
    
    if (!response.success) {
      throw new Error(`Element marking failed: ${response.error || 'Unknown error'}`);
    }
    
    const elements = response.data?.elements || response.elements;
    
    if (!elements || !Array.isArray(elements)) {
      throw new Error('Invalid response format: elements array missing');
    }
    
    console.log(`[AgentController] Successfully received ${elements.length} elements`);
    return elements;
  }

  private async executeAction(action: AIAction, elements: MarkedElement[]): Promise<ActionResult> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_ACTION',
        action,
        elements
      });
      
      if (!response) {
        return {
          success: false,
          message: `액션 실행 실패: ${action.type}`,
          error: 'No response from background script'
        };
      }
      
      if (!response.success) {
        return {
          success: false,
          message: `액션 실행 실패: ${action.type}`,
          error: response.error || 'Unknown error'
        };
      }
      
      return {
        success: true,
        message: this.getActionDescription(action),
      };
    } catch (error) {
      return {
        success: false,
        message: `액션 실행 중 오류: ${action.type}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async clearMarkers(): Promise<void> {
    try {
      await chrome.runtime.sendMessage({ 
        type: 'CLEAR_MARKERS' 
      });
    } catch (error) {
      console.warn('[AgentController] Failed to clear markers:', error);
    }
  }


  private convertPredictionToAction(prediction: Prediction): AIAction {
    console.log('[AgentController] Converting prediction to action:', prediction);
    
    switch (prediction.action) {
      case 'Click':
        if (prediction.args && prediction.args.length > 0) {
          const elementId = parseInt(String(prediction.args[0]));
          return {
            type: 'click',
            elementId: elementId
          };
        }
        break;
        
      case 'Type':
        if (prediction.args && prediction.args.length >= 2) {
          const elementId = parseInt(String(prediction.args[0]));
          const text = String(prediction.args[1]);
          return {
            type: 'type',
            elementId: elementId,
            text: text
          };
        }
        break;
        
      case 'Scroll':
        if (prediction.args && prediction.args.length >= 2) {
          const direction = String(prediction.args[1]) as 'up' | 'down';
          return {
            type: 'scroll',
            direction: direction
          };
        }
        break;
        
      case 'Wait':
        return {
          type: 'wait',
          duration: 5000
        };
        
      case 'GoBack':
        return { type: 'done' };
        
      case 'Navigate':
        return {
          type: 'navigate',
          url: prediction.args?.[0] as string || ''
        };
        
      case 'ANSWER':
        return { type: 'done' };
        
      case 'retry':
        return { type: 'wait', duration: 1000 };
        
      default:
        return { type: 'done' };
    }
    
    return { type: 'done' };
  }

  private updateScratchpad(result: ActionResult): void {
    const stepNumber = this.currentStep;
    if (this.scratchpad === '') {
      this.scratchpad = 'Previous action observations:\n';
    }
    this.scratchpad += `\n${stepNumber}. ${result.message}`;
  }


  setClaudeApiKey(apiKey: string) {
    this.claudeClient.setApiKey(apiKey);
    console.log('[AgentController] Claude API key configured');
  }

  isApiReady(): boolean {
    return this.claudeClient.hasApiKey();
  }

  private getActionDescription(action: AIAction): string {
    switch (action.type) {
      case 'click':
        return action.elementId ? `요소 ${action.elementId} 클릭` : '클릭';
      case 'type':
        return action.elementId ? 
          `요소 ${action.elementId}에 "${action.text}" 입력` : 
          `"${action.text}" 입력`;
      case 'scroll':
        return `${action.direction === 'up' ? '위로' : '아래로'} 스크롤`;
      case 'wait':
        return `${action.duration || 2000}ms 대기`;
      case 'navigate':
        return `${action.url}로 이동`;
      case 'done':
        return '작업 완료';
      default:
        return '알 수 없는 작업';
    }
  }
  
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  stop(): void {
    if (this.isRunning) {
      console.log('[AgentController] Stopping agent execution');
      this.shouldStop = true;
    }
  }
  
  isExecuting(): boolean {
    return this.isRunning;
  }
  
  getProgress(): { currentStep: number; maxSteps: number } {
    return {
      currentStep: this.currentStep,
      maxSteps: this.maxSteps
    };
  }
}