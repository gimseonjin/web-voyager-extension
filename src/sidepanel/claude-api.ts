import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { MarkedElement, ScreenshotData } from '../shared/types';

// Zod schema for structured output
const PredictionSchema = z.object({
  action: z.enum(['Click', 'Type', 'Scroll', 'Wait', 'GoBack', 'Navigate', 'ANSWER', 'retry']),
  args: z.array(z.unknown()).optional(),
  reasoning: z.string()
});

export type Prediction = z.infer<typeof PredictionSchema>;

class WebVoyagerCallbackHandler extends BaseCallbackHandler {
  name = 'WebVoyagerCallbackHandler';

  async handleLLMStart(llm: any, prompts: string[], runId: string, parentRunId?: string) {
    console.log('🚀 [LangChain] LLM Start:', {
      runId: runId.slice(0, 8),
      parentRunId: parentRunId?.slice(0, 8),
      model: llm.model,
      maxTokens: llm.maxTokens,
      temperature: llm.temperature,
      promptCount: prompts.length,
      promptLength: prompts[0]?.length || 0
    });
  }

  async handleLLMEnd(output: any, runId: string) {
    console.log('✅ [LangChain] LLM End:', {
      runId: runId.slice(0, 8),
      outputType: typeof output,
      generations: output.generations?.length || 0,
      totalTokens: output.llmOutput?.token_usage?.total_tokens || 'unknown'
    });
  }

  async handleLLMError(error: Error, runId: string) {
    console.error('❌ [LangChain] LLM Error:', {
      runId: runId.slice(0, 8),
      error: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3)
    });
  }

  async handleChainStart(chain: any, inputs: any, runId: string) {
    console.log('⛓️ [LangChain] Chain Start:', {
      runId: runId.slice(0, 8),
      chainType: chain._llmType || chain.constructor.name,
      inputKeys: Object.keys(inputs || {})
    });
  }

  async handleChainEnd(outputs: any, runId: string) {
    console.log('✅ [LangChain] Chain End:', {
      runId: runId.slice(0, 8),
      outputKeys: Object.keys(outputs || {})
    });
  }

  async handleChainError(error: Error, runId: string) {
    console.error('❌ [LangChain] Chain Error:', {
      runId: runId.slice(0, 8),
      error: error.message
    });
  }

  async handleText(text: string, runId: string) {
    console.log('💬 [LangChain] Text:', {
      runId: runId.slice(0, 8),
      text: text.slice(0, 100) + (text.length > 100 ? '...' : '')
    });
  }
}

export class ClaudeAPIClient {
  private model: ChatAnthropic | null = null;

  constructor() {
    console.log('[ClaudeAPIClient] Initialized with LangChain');
  }

  async analyzePage(
    screenshot: ScreenshotData,
    elements: MarkedElement[],
    userQuery: string,
    scratchpad: string = ''
  ): Promise<Prediction> {
    
    if (!this.model) {
      throw new Error('Claude API key not set. Please configure your API key first.');
    }
    
    return await this.callLangChainClaude(screenshot, elements, userQuery, scratchpad);
  }

  private async callLangChainClaude(
    screenshot: ScreenshotData,
    elements: MarkedElement[],
    userQuery: string,
    scratchpad: string
  ): Promise<Prediction> {
    if (!this.model) {
      throw new Error('Claude model not initialized');
    }

    const bboxDescriptions = this.formatBBoxDescriptions(elements);
    
    try {
      console.log('[ClaudeAPIClient] 🚀 Starting LangChain Claude API call...');
      console.log('[ClaudeAPIClient] 📝 User Query:', userQuery);
      console.log('[ClaudeAPIClient] 🎯 Elements found:', elements.length);
      console.log('[ClaudeAPIClient] 📊 Screenshot size:', screenshot.data.length, 'chars');
      console.log('[ClaudeAPIClient] 📋 Scratchpad:', scratchpad || 'Empty');
      
      const structuredModel = this.model.withStructuredOutput(PredictionSchema);
      console.log('[ClaudeAPIClient] ⚙️ Structured model created with schema:', PredictionSchema.shape);
      
      const promptText = `You are a web automation assistant. Analyze this screenshot and user request to determine the next action.

Available actions:
- Click [number] - Click on the element with that number
- Type [number];[text] - Type text into the element 
- Scroll [WINDOW|number];[up|down] - Scroll window or element
- Wait - Wait 5 seconds
- GoBack - Go back one page
- Navigate - Navigate to the URL
- ANSWER - Task completed
- retry - Retry if there was an error

Always respond with a valid JSON object containing "action", "args", and "reasoning" fields.

User Request: ${userQuery}

${bboxDescriptions}

Previous actions:
${scratchpad || 'No previous actions'}

Based on the screenshot and available elements, determine the next action to take.`;
      
      const messageWithImage = [
        {
          type: "text",
          text: promptText
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${screenshot.data}`
          }
        }
      ];

      console.log('[ClaudeAPIClient] 📤 Sending message with prompt length:', promptText.length);
      console.log('[ClaudeAPIClient] 🖼️ Image data prepared with base64 prefix');
      
      const startTime = Date.now();

      const callbackHandler = new WebVoyagerCallbackHandler();

      const result = await structuredModel.invoke([
        { role: "human", content: messageWithImage }
      ], {
        callbacks: [callbackHandler]
      });

      const endTime = Date.now();
      console.log('[ClaudeAPIClient] ⏱️ API call completed in', endTime - startTime, 'ms');
      console.log('[ClaudeAPIClient] 📥 Raw LangChain response:', JSON.stringify(result, null, 2));
      console.log('[ClaudeAPIClient] 🎯 Action:', result.action);
      console.log('[ClaudeAPIClient] 📝 Args:', result.args);
      console.log('[ClaudeAPIClient] 🧠 Reasoning:', result.reasoning);
      
      // Zod schema로 이미 검증된 결과 반환
      return result;
      
    } catch (error) {
      console.error('[ClaudeAPIClient] ❌ LangChain Claude API error:', error);
      console.error('[ClaudeAPIClient] 🔍 Error details:', {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        stack: (error as Error)?.stack?.split('\n').slice(0, 3),
        cause: (error as any)?.cause
      });
      
      if (error instanceof Error) {
        console.error('[ClaudeAPIClient] 📊 Error analysis:', {
          isNetworkError: error.message.includes('network') || error.message.includes('fetch'),
          isAuthError: error.message.includes('auth') || error.message.includes('unauthorized'),
          isRateLimitError: error.message.includes('rate') || error.message.includes('limit'),
          isQuotaError: error.message.includes('quota') || error.message.includes('usage')
        });
      }
      
      throw new Error(`Claude API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  private formatBBoxDescriptions(elements: MarkedElement[]): string {
    console.log('[ClaudeAPIClient] 📋 Formatting bounding boxes for', elements.length, 'elements');
    
    const descriptions = elements.map((el, i) => {
      const text = el.attributes?.['aria-label'] || el.text || '';
      const type = el.tagName;
      const attrs = Object.entries(el.attributes || {})
        .filter(([key, value]) => value && ['type', 'name', 'placeholder', 'href'].includes(key))
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      
      const description = `${i} (<${type} ${attrs}/>): "${text.slice(0, 50)}"`;
      console.log('[ClaudeAPIClient] 🔸 Element', i, ':', {
        id: el.id,
        tag: type,
        text: text.slice(0, 30),
        rect: `${Math.round(el.rect.left)},${Math.round(el.rect.top)} ${Math.round(el.rect.width)}x${Math.round(el.rect.height)}`,
        attributes: Object.keys(el.attributes || {}).length
      });
      
      return description;
    });

    const formatted = `Valid Bounding Boxes:\n${descriptions.join('\n')}`;
    console.log('[ClaudeAPIClient] 📋 Final formatted descriptions length:', formatted.length);
    
    return formatted;
  }


  // API 키 설정 및 LangChain 모델 초기화
  setApiKey(apiKey: string) {
    try {
      this.model = new ChatAnthropic({
        anthropicApiKey: apiKey,
        model: 'claude-sonnet-4-5', // 최신 Claude 3.5 Sonnet 모델
        maxTokens: 1024,
        temperature: 0.1, // 일관된 출력을 위해 낮은 temperature
        verbose: true, // LangChain 내부 로깅 활성화
        callbacks: [new WebVoyagerCallbackHandler()] // 글로벌 콜백 핸들러
      });
      
      console.log('[ClaudeAPIClient] LangChain Claude model initialized successfully');
    } catch (error) {
      console.error('[ClaudeAPIClient] Failed to initialize Claude model:', error);
      this.model = null;
      throw new Error(`Failed to initialize Claude model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 모델 상태 확인
  hasApiKey(): boolean {
    return !!this.model;
  }

  isModelReady(): boolean {
    return !!this.model;
  }
}