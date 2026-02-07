'use client'

import { useState, useEffect, useRef, useId } from 'react'

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
})();
</script>
</body>
</html>`
}

export function CardIframe({ html, css, minHeight = 60, className }: CardIframeProps) {
  const frameId = useId()
  const [height, setHeight] = useState(minHeight)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (
        e.data &&
        e.data.type === 'card-iframe-resize' &&
        e.data.frameId === frameId
      ) {
        const newHeight = Math.max(e.data.height, minHeight)
        setHeight(newHeight)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [frameId, minHeight])

  // Reset height when content changes
  useEffect(() => {
    setHeight(minHeight)
  }, [html, css, minHeight])

  const srcdoc = buildSrcdoc(html, css, frameId)

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts allow-popups"
      style={{ height: `${height}px`, minHeight: `${minHeight}px` }}
      className={`w-full border-0 ${className || ''}`}
      title="Card content"
    />
  )
}

export { buildSrcdoc }
