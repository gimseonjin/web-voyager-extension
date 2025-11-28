import type { MarkedElement } from '../shared/types';

export class ElementMarker {
  private markers: Map<number, HTMLElement> = new Map();
  private markedElements: MarkedElement[] = [];
  private isMarking: boolean = false;

  async markClickableElements(): Promise<MarkedElement[]> {
    if (this.isMarking) {
      console.log('[ElementMarker] Already marking elements');
      return this.markedElements;
    }

    console.log('[ElementMarker] Starting element marking...');
    this.isMarking = true;

    try {
      this.clearMarkers();

      const clickableElements = this.findClickableElements();
      const scrollableElements = this.findScrollableElements();
      
      const allElements = [...clickableElements];
      scrollableElements.forEach((scrollEl: Element) => {
        if (!clickableElements.includes(scrollEl)) {
          allElements.push(scrollEl);
        }
      });
      
      console.log(`[ElementMarker] Found ${clickableElements.length} clickable and ${scrollableElements.length} scrollable elements`);

      let visibleCount = 0;
      let hiddenCount = 0;
      let scrollableCount = 0;

      this.markedElements = allElements.map((element, index) => {
        const id = index;
        const rect = element.getBoundingClientRect();
        const isScrollable = scrollableElements.includes(element);
        
        element.setAttribute('data-voyager-checking', 'true');
        const isVisible = this.isElementVisible(rect);
        
        if (isVisible) {
          this.createMarker(id, rect, isScrollable);
          visibleCount++;
          if (isScrollable) scrollableCount++;
        } else {
          hiddenCount++;
          const elementInfo = {
            id: element.id,
            class: element.className,
            tag: element.tagName,
            text: this.getElementText(element).slice(0, 30),
            rect: `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
          };
          console.log('[ElementMarker] Hidden element filtered:', elementInfo);
        }

        return {
          id,
          tagName: element.tagName.toLowerCase(),
          text: this.getElementText(element),
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          },
          attributes: this.getElementAttributes(element),
          scrollable: isScrollable
        };
      });

      console.log(`[ElementMarker] Marked ${visibleCount} visible elements (${scrollableCount} scrollable), filtered ${hiddenCount} hidden elements`);
      return this.markedElements;

    } finally {
      this.isMarking = false;
    }
  }

  private findScrollableElements(): Element[] {
    const elements: Element[] = [];
    
    const allElements = document.querySelectorAll('*');
    
    allElements.forEach(element => {
      if (!(element instanceof HTMLElement)) return;
      
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      
      if (rect.width <= 0 || rect.height <= 0) return;
      if (style.display === 'none' || style.visibility === 'hidden') return;
      
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const overflow = style.overflow;
      
      const isScrollableY = overflowY === 'scroll' || overflowY === 'auto' || overflow === 'scroll' || overflow === 'auto';
      const isScrollableX = overflowX === 'scroll' || overflowX === 'auto' || overflow === 'scroll' || overflow === 'auto';
      
      if (isScrollableY || isScrollableX) {
        const hasScrollableContent = element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
        
        if (hasScrollableContent) {
          if (rect.width > 50 && rect.height > 50) {
            elements.push(element);
          }
        }
      }
    });
    
    const scrollSelectors = [
      '[role="scrollbar"]',
      '.scroll-container',
      '.scrollable',
      '.overflow-auto',
      '.overflow-scroll',
      '.overflow-x-auto',
      '.overflow-y-auto',
      '.overflow-x-scroll',
      '.overflow-y-scroll',
      '[data-scroll]',
      '[data-scrollable]'
    ];
    
    scrollSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        if (!elements.includes(element) && element instanceof HTMLElement) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 50 && rect.height > 50) {
            elements.push(element);
          }
        }
      });
    });
    
    return elements;
  }
  
  private findClickableElements(): Element[] {
    const selectors = [
      'a[href]',                    // 링크
      'button',                     // 버튼
      'input[type="button"]',       // 버튼 타입 인풋
      'input[type="submit"]',       // 제출 버튼
      'input[type="reset"]',        // 리셋 버튼
      'input[type="checkbox"]',     // 체크박스
      'input[type="radio"]',        // 라디오 버튼
      'input[type="text"]',         // 텍스트 입력
      'input[type="email"]',        // 이메일 입력
      'input[type="password"]',     // 패스워드 입력
      'input[type="search"]',       // 검색 입력
      'input[type="tel"]',          // 전화번호 입력
      'input[type="url"]',          // URL 입력
      'textarea',                   // 텍스트 에리어
      'select',                     // 셀렉트 박스
      '[onclick]',                  // onclick 이벤트가 있는 요소
      '[role="button"]',            // 버튼 역할의 요소
      '[role="link"]',              // 링크 역할의 요소
      '[role="tab"]',               // 탭 역할의 요소
      '[role="menuitem"]',          // 메뉴 아이템 역할의 요소
      '[role="option"]',            // 옵션 역할의 요소
      '[role="checkbox"]',          // 체크박스 역할의 요소
      '[role="radio"]',             // 라디오 버튼 역할의 요소
      '[role="switch"]',            // 스위치 역할의 요소
      '[role="combobox"]',          // 콤보박스 역할의 요소
      '[role="textbox"]',           // 텍스트박스 역할의 요소
      '[role="searchbox"]',         // 검색박스 역할의 요소
      '[role="slider"]',            // 슬라이더 역할의 요소
      '[role="spinbutton"]',        // 스핀버튼 역할의 요소
      '[tabindex]',                 // 탭 인덱스가 있는 요소 (키보드 접근 가능)
    ];

    const elements = Array.from(document.querySelectorAll(selectors.join(', ')));
    
    const uniqueElements = Array.from(new Set(elements));
    
    return uniqueElements.filter(element => {
      if (!(element instanceof HTMLElement)) return false;
      
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      
      if (style.display === 'none' || 
          style.visibility === 'hidden' || 
          style.opacity === '0') {
        return false;
      }
      
      if (rect.top < -1000 || rect.left < -1000) {
        return false;
      }
      
      if (rect.width <= 0 || rect.height <= 0 || 
          (rect.width < 10 && rect.height < 10)) {
        return false;
      }
      
      if (style.overflow === 'hidden' && (rect.width < 1 || rect.height < 1)) {
        return false;
      }
      
      const skipPatterns = [
        'skip-to',
        'skip-nav',
        'screen-reader',
        'sr-only',
        'visually-hidden',
        'a11y-hidden',
        'assistive-text'
      ];
      
      const elementId = element.id?.toLowerCase() || '';
      const elementClass = element.className?.toString().toLowerCase() || '';
      const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
      
      for (const pattern of skipPatterns) {
        if (elementId.includes(pattern) || 
            elementClass.includes(pattern) ||
            ariaLabel.includes('skip to')) {
          return false;
        }
      }
      
      const isInViewport = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
      
      if (!isInViewport && style.position === 'absolute') {
        const zIndex = parseInt(style.zIndex || '0');
        if (zIndex > 9000) {
          return false;
        }
      }
      
      if (element.getAttribute('aria-hidden') === 'true') {
        return false;
      }
      
      if (element.tagName === 'A' || element.tagName === 'BUTTON') {
        const bgColor = style.backgroundColor;
        const color = style.color;
        if ((bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') &&
            (color === 'transparent' || color === 'rgba(0, 0, 0, 0)')) {
          return false;
        }
      }
      
      return true;
    });
  }

  private getElementText(element: Element): string {
    let text = '';
    
    if (element instanceof HTMLInputElement) {
      text = element.placeholder || element.value || element.type;
    } else if (element instanceof HTMLElement) {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            return node.parentNode === element ? 
              NodeFilter.FILTER_ACCEPT : 
              NodeFilter.FILTER_SKIP;
          }
        }
      );
      
      const textParts: string[] = [];
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent?.trim()) {
          textParts.push(node.textContent.trim());
        }
      }
      
      text = textParts.join(' ');
      
      if (!text.trim()) {
        text = (element as HTMLElement).getAttribute('alt') ||
               (element as HTMLElement).getAttribute('title') ||
               (element as HTMLElement).getAttribute('aria-label') ||
               (element as HTMLElement).innerText?.trim() ||
               '';
      }
    }
    
    return text.slice(0, 100);
  }

  private getElementAttributes(element: Element): Record<string, string> {
    const attrs: Record<string, string> = {};
    const importantAttrs = ['id', 'class', 'name', 'type', 'href', 'src', 'alt', 'title', 'aria-label', 'placeholder', 'value'];
    
    importantAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        attrs[attr] = value;
      }
    });

    if (element instanceof HTMLInputElement && element.value) {
      attrs['value'] = element.value;
    }
    
    return attrs;
  }

  private isElementVisible(rect: DOMRect): boolean {
    const inViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
      rect.width > 0 &&
      rect.height > 0
    );
    
    if (!inViewport) return false;
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const elementAtPoint = document.elementFromPoint(centerX, centerY);
    
    const element = document.querySelector(`[data-voyager-checking="true"]`) as HTMLElement;
    if (element && elementAtPoint) {
      const isVisible = element === elementAtPoint || element.contains(elementAtPoint);
      element.removeAttribute('data-voyager-checking');
      return isVisible;
    }
    
    return true;
  }

  private createMarker(id: number, rect: DOMRect, isScrollable: boolean = false): void {
    const marker = document.createElement('div');
    marker.className = 'voyager-marker';
    marker.textContent = isScrollable ? `⇕${id}` : String(id);
    marker.setAttribute('data-voyager-id', String(id));
    
    const bgColor = isScrollable ? '#4444ff' : '#ff4444';
    const borderColor = isScrollable ? '#0000cc' : '#cc0000';
    
    marker.style.cssText = `
      position: fixed;
      background: ${bgColor};
      color: white;
      padding: 2px 6px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 11px;
      font-weight: bold;
      z-index: 2147483647;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      border: 1px solid ${borderColor};
      min-width: 16px;
      text-align: center;
      line-height: 1.2;
    `;
    
    marker.style.left = `${rect.left - 2}px`;
    marker.style.top = `${rect.top - 2}px`;
    
    document.body.appendChild(marker);
    this.markers.set(id, marker);
  }

  clearMarkers(): void {
    console.log(`[ElementMarker] Clearing ${this.markers.size} markers`);
    
    this.markers.forEach(marker => {
      if (marker.parentNode) {
        marker.parentNode.removeChild(marker);
      }
    });
    
    this.markers.clear();
    this.markedElements = [];
  }

  getMarkedElements(): MarkedElement[] {
    return this.markedElements;
  }

  getElementById(id: number): MarkedElement | null {
    return this.markedElements.find(el => el.id === id) || null;
  }

  getElementCount(): number {
    return this.markedElements.length;
  }

  isMarked(): boolean {
    return this.markers.size > 0;
  }
}

export const elementMarker = new ElementMarker();