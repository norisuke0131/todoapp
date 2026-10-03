'use client'
// カメラでのバーコード読み取り（FR-303：任意で有効化）
// ★ カメラは押したときにだけ起動する。ライブラリも押したときに読み込む（初期バンドルに入れない）
import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const [on, setOn] = useState(false)
  const [error, setError] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const stop = useRef<() => void>(undefined)
  const lastCode = useRef({ code: '', at: 0 })

  useEffect(() => {
    if (!on) return
    let cancelled = false
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled || !video.current) return
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoDevice(undefined, video.current, (result) => {
          if (!result) return
          const code = result.getText()
          const now = Date.now()
          // 同じコードを1.2秒以内に読み直したら無視（カメラは連続で同じ枠を読むため）
          if (code === lastCode.current.code && now - lastCode.current.at < 1200) return
          lastCode.current = { code, at: now }
          onScan(code)
        })
        stop.current = () => controls.stop()
      } catch {
        setError(
          'カメラを使えませんでした。ブラウザのカメラの許可を確かめるか、ハンディ端末・キー入力でスキャンしてください',
        )
        setOn(false)
      }
    })()
    return () => {
      cancelled = true
      stop.current?.()
    }
  }, [on, onScan])

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        variant={on ? 'secondary' : 'ghost'}
        className="self-start"
        onClick={() => setOn((v) => !v)}
      >
        {on ? <CameraOff aria-hidden /> : <Camera aria-hidden />}
        {on ? 'カメラを止める' : 'カメラで読む'}
      </Button>
      {on && (
        <video
          ref={video}
          muted
          playsInline
          className="aspect-[4/3] w-full max-w-[360px] rounded bg-ink-900 object-cover"
          aria-label="カメラの映像"
        />
      )}
      {error && (
        <p role="alert" className="text-[12px] text-st-ink-stockout">
          {error}
        </p>
      )}
    </div>
  )
}
