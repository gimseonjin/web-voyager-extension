export interface MarkedElement {
  id: number;
  tagName: string;
  text: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  attributes?: Record<string, string>;
  scrollable?: boolean;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface AIAction {
  type: 'click' | 'type' | 'scroll' | 'wait' | 'done' | 'navigate';
  elementId?: number;
  text?: string;
  direction?: 'up' | 'down';
  duration?: number;
  x?: number;
  y?: number;
  url?: string;
  amount?: number;
}

export interface AIResponse {
  action: AIAction;
  reasoning: string;
  message: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  error?: string;
  reasoning?: string;
}

export interface ExtensionMessage {
  type: 'CAPTURE_SCREENSHOT' | 'MARK_ELEMENTS' | 'CLEAR_MARKERS' | 'EXECUTE_ACTION' | 'GET_ELEMENTS' | 'NAVIGATE';
  action?: AIAction;
  elements?: MarkedElement[];
  data?: any;
  url?: string;
}

export interface ScreenshotData {
  data: string; // base64 encoded image
  width?: number;
  height?: number;
}