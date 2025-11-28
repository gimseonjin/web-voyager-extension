import { elementMarker } from './marker';
import type { ExtensionMessage } from '../shared/types';

console.log('[Content Script] Web Voyager content script loaded on:', window.location.href);

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  console.log('[Content Script] Received message:', message.type);
  
  (async () => {
    try {
      switch (message.type) {
        case 'MARK_ELEMENTS':
          const elements = await elementMarker.markClickableElements();
          console.log(`[Content Script] Sending ${elements.length} elements to background`);
          sendResponse({ success: true, elements });
          break;

        case 'CLEAR_MARKERS':
          elementMarker.clearMarkers();
          console.log('[Content Script] Markers cleared, sending response');
          sendResponse({ success: true });
          break;

        case 'GET_ELEMENTS':
          const currentElements = elementMarker.getMarkedElements();
          console.log(`[Content Script] Sending ${currentElements.length} current elements`);
          sendResponse({ success: true, elements: currentElements });
          break;

        default:
          console.error('[Content Script] Unknown message type:', message.type);
          sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      }
    } catch (error) {
      console.error('[Content Script] Message handling error:', error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  })();
  
  return true;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Content Script] DOM ready');
  });
} else {
  console.log('[Content Script] DOM already ready');
}

window.addEventListener('beforeunload', () => {
  elementMarker.clearMarkers();
});

if (typeof window !== 'undefined') {
  (window as any).voyagerMarker = elementMarker;
}
