'use client'

import { useState, useEffect, useRef, useId, useCallback } from 'react'

interface CardIframeProps {
  html: string
  css: string
  minHeight?: number
  className?: string
}

function buildSrcdoc(html: string, css: string, frameId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #1a1a1a;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .cloze-deletion.cloze-hidden {
    color: #2563eb;
    font-weight: bold;
  }
  .cloze-deletion.cloze-answer {
    color: #2563eb;
    font-weight: bold;
  }
  img { max-width: 100%; height: auto; }
  ${css}
</style>
</head>
<body>
<div class="card">${html}</div>
<script>
(function() {
  var frameId = ${JSON.stringify(frameId)};
  function sendHeight() {
    var h = document.documentElement.scrollHeight;
    parent.postMessage({ type: 'card-iframe-resize', frameId: frameId, height: h }, '*');
  }
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(sendHeight).observe(document.body);
  }
  sendHeight();
  setTimeout(sendHeight, 50);
  setTimeout(sendHeight, 200);
})();
</script>
</body>
</html>`
}

export function CardIframe({ html, css, minHeight = 60, className }: CardIframeProps) {
  const frameId = useId()
  const [height, setHeight] = useState(minHeight)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleMessage = useCallback((e: MessageEvent) => {
    if (
      e.data &&
      e.data.type === 'card-iframe-resize' &&
      e.data.frameId === frameId
    ) {
      const newHeight = Math.max(e.data.height, minHeight)
      setHeight(newHeight)
    }
  }, [frameId, minHeight])

  // Listen for resize messages - register ONCE on mount, stable via useCallback
  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  // Reset height when content changes
  useEffect(() => {
    setHeight(minHeight)
  }, [html, css, minHeight])

  // Programmatically set srcdoc via ref to ensure browser re-renders
  useEffect(() => {
    const iframe = iframeRef.current
    if (iframe) {
      iframe.srcdoc = buildSrcdoc(html, css, frameId)
    }
  }, [html, css, frameId])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={buildSrcdoc(html, css, frameId)}
      sandbox="allow-scripts allow-popups"
      style={{ height: `${height}px`, minHeight: `${minHeight}px` }}
      className={`w-full border-0 ${className || ''}`}
      title="Card content"
      scrolling="no"
    />
  )
}

export { buildSrcdoc }
