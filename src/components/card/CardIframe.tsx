'use client'

import { useState, useEffect, useRef, useId, useCallback } from 'react'

interface CardIframeProps {
  html: string
  css: string
  minHeight?: number
  className?: string
  onTtsPlay?: (fieldName: string) => void
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
  .tts-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border: none;
    border-radius: 50%;
    background: #f3f4f6;
    color: #4b5563;
    cursor: pointer;
    vertical-align: middle;
    transition: background 0.15s;
  }
  .tts-btn:hover { background: #e5e7eb; }
  .tts-btn:active { background: #d1d5db; }
  .tts-btn.playing { background: #dbeafe; color: #2563eb; }
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

  // TTS button click handler
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.tts-btn');
    if (btn) {
      var field = btn.getAttribute('data-tts-field');
      if (field) {
        parent.postMessage({ type: 'card-tts-play', frameId: frameId, fieldName: field }, '*');
      }
    }
  });

  // Listen for TTS state updates from parent
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'card-tts-state' && e.data.frameId === frameId) {
      var btns = document.querySelectorAll('.tts-btn[data-tts-field="' + e.data.fieldName + '"]');
      for (var i = 0; i < btns.length; i++) {
        if (e.data.playing) {
          btns[i].classList.add('playing');
        } else {
          btns[i].classList.remove('playing');
        }
      }
    }
  });
})();
</script>
</body>
</html>`
}

export function CardIframe({ html, css, minHeight = 60, className, onTtsPlay }: CardIframeProps) {
  const frameId = useId()
  const [isMounted, setIsMounted] = useState(false)
  const [height, setHeight] = useState(minHeight)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Client-only: avoid SSR hydration mismatch with iframe srcDoc
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const handleMessage = useCallback((e: MessageEvent) => {
    if (!e.data || e.data.frameId !== frameId) return
    if (e.data.type === 'card-iframe-resize') {
      const newHeight = Math.max(e.data.height, minHeight)
      setHeight(newHeight)
    } else if (e.data.type === 'card-tts-play') {
      onTtsPlay?.(e.data.fieldName)
    }
  }, [frameId, minHeight, onTtsPlay])

  // Listen for resize messages
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

  // SSR placeholder - prevents hydration mismatch
  if (!isMounted) {
    return (
      <div
        style={{ minHeight: `${minHeight}px` }}
        className={`w-full ${className || ''}`}
      />
    )
  }

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
