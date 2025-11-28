# Web Voyager Extension

Claude AI 기반 웹 자동화 Chrome 확장 프로그램입니다. 자연어 명령으로 웹페이지를 조작할 수 있습니다.

## 데모

[![Watch the video](https://img.youtube.com/vi/8_VFAAFScOg/hqdefault.jpg)](https://youtu.be/8_VFAAFScOg)

## 주요 기능

- **스크린샷 캡처**: 현재 페이지를 자동으로 캡처
- **요소 마킹**: 클릭 가능한 요소를 번호로 표시
- **AI 자동화**: Chrome DevTools Protocol을 통한 정밀한 브라우저 제어
- **자연어 인터페이스**: "구글에서 ChatGPT 검색해줘" 같은 명령 지원

## 지원 액션

- **Click**: 요소 클릭
- **Type**: 텍스트 입력
- **Scroll**: 페이지/요소 스크롤
- **Navigate**: 페이지 이동
- **Wait**: 대기

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
```

### Chrome에 확장 프로그램 로드

1. `chrome://extensions` 접속
2. 개발자 모드 ON
3. "압축해제된 확장 프로그램 로드" 클릭
4. `dist` 폴더 선택

## 사용법

1. 웹페이지에서 Extension 아이콘 클릭
2. Side Panel 열기
3. Claude API 키 입력
4. 자연어 명령 입력 (예: "구글에서 ChatGPT 검색해줘")
5. AI가 자동으로 작업 수행

## 기술 스택

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite + CRXJS Plugin
- **AI**: LangChain + Anthropic Claude API
- **Chrome APIs**: Manifest V3, Debugger API, Tabs API
- **Automation**: Chrome DevTools Protocol

## 프로젝트 구조

```
src/
├── background/          # Background Service Worker
│   ├── main.ts          # 진입점
│   ├── chrome-controller.ts
│   ├── browser.ts
│   ├── tab.ts
│   ├── document.ts
│   └── cdp-session.ts   # Chrome DevTools Protocol
├── content/             # Content Scripts
│   ├── main.tsx
│   └── marker.ts        # 요소 마킹
├── sidepanel/           # Side Panel UI
│   ├── App.tsx          # React 채팅 인터페이스
│   ├── agent-controller.ts
│   └── claude-api.ts    # Claude API 클라이언트
└── shared/
    └── types.ts         # 공용 타입 정의
```

## 아키텍처

### 시스템 구조

```mermaid
flowchart TB
    subgraph Chrome Extension
        subgraph SidePanel["Side Panel (React UI)"]
            App[App.tsx]
            AC[AgentController]
            Claude[ClaudeAPIClient]
        end

        subgraph Background["Background Service Worker"]
            BG[BackgroundService]
            CC[ChromeController]
            Browser[Browser]
            Tab[Tab]
            CDP[CDPSession]
            Doc[Document]
        end

        subgraph Content["Content Script"]
            Main[main.tsx]
            Marker[ElementMarker]
        end
    end

    subgraph External
        API[Claude API]
        Page[Web Page DOM]
    end

    App --> AC
    AC --> Claude
    Claude <-->|LangChain| API

    AC <-->|chrome.runtime.sendMessage| BG
    BG --> CC
    CC --> Browser
    Browser --> Tab
    Tab --> CDP
    Tab --> Doc

    CDP <-->|Chrome Debugger API| Page
    Doc <-->|chrome.tabs.sendMessage| Main
    Main --> Marker
    Marker -->|DOM 조작| Page
```

### 클래스 다이어그램

```mermaid
classDiagram
    class BackgroundService {
        -ChromeController chromeController
        +initialize()
        +handleMessage(message)
    }

    class ChromeController {
        -Map~number, Browser~ browsers
        -number activeWindowId
        +initialize()
        +getCurrentTab() Tab
        +onTabActivated(tabId, windowId)
        +onTabUpdated(tabId, url)
    }

    class Browser {
        -number windowId
        -Map~number, Tab~ tabs
        -number activeTabId
        +createTab(tabId, url) Tab
        +getTab(tabId) Tab
        +setActiveTab(tabId)
    }

    class Tab {
        -number tabId
        -Document document
        -CDPSession cdpSession
        +initialize()
        +captureScreenshot() ScreenshotData
        +executeAction(action, elements)
    }

    class CDPSession {
        -number tabId
        -boolean connected
        +connect()
        +disconnect()
        +captureScreenshot() ScreenshotData
        +simulateClick(x, y)
        +simulateType(text)
        +simulateScroll(direction, amount)
    }

    class Document {
        -Tab tab
        -MarkedElement[] elements
        +markElements() MarkedElement[]
        +clearMarkers()
        +getElementById(id) MarkedElement
    }

    class AgentController {
        -ClaudeAPIClient claudeClient
        -number maxSteps
        -string scratchpad
        +runAgent(query) AgentResult
        +stop()
    }

    class ClaudeAPIClient {
        -ChatAnthropic model
        +analyzePage(screenshot, elements, query) Prediction
        +setApiKey(apiKey)
    }

    class ElementMarker {
        -Map~number, HTMLElement~ markers
        -MarkedElement[] markedElements
        +markClickableElements() MarkedElement[]
        +clearMarkers()
    }

    BackgroundService --> ChromeController
    ChromeController --> Browser
    Browser --> Tab
    Tab --> CDPSession
    Tab --> Document
    AgentController --> ClaudeAPIClient
    Document ..> ElementMarker : messages
```

### 메시지 흐름

```mermaid
sequenceDiagram
    participant SP as Side Panel
    participant BG as Background
    participant CDP as CDPSession
    participant CS as Content Script

    SP->>BG: CAPTURE_SCREENSHOT
    BG->>CDP: captureScreenshot()
    CDP-->>BG: ScreenshotData
    BG-->>SP: screenshot

    SP->>BG: MARK_ELEMENTS
    BG->>CS: MARK_ELEMENTS
    CS->>CS: ElementMarker.markClickableElements()
    CS-->>BG: MarkedElement[]
    BG-->>SP: elements

    SP->>SP: ClaudeAPI.analyzePage()
    Note over SP: AI가 다음 액션 결정

    SP->>BG: EXECUTE_ACTION
    BG->>CDP: executeAction(click/type/scroll)
    CDP-->>BG: success
    BG-->>SP: result

    SP->>BG: CLEAR_MARKERS
    BG->>CS: CLEAR_MARKERS
    CS->>CS: ElementMarker.clearMarkers()
```
