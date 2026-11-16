import { useEffect, useRef, useState, type DragEvent } from 'react'
import { translate, useT } from '../../i18n'
import { Icon } from '../Icon'
import { PhotoTips } from '../PhotoTips'
import { Banner, Spinner } from '../ui'
import { errorMessage } from '../../lib/api'
import { radioKeys } from '../../lib/radio'
import type { Product } from '../../lib/types'
import { uploadPhoto } from '../../services/media'
import { listProducts } from '../../services/products'

export interface ReelSource {
  productId?: string
  mediaAssetId?: string
  imageUrl: string
  label: string
  price?: string | null
}

/** An extra photo for the middle scenes of the Reel. */
export interface ReelExtra {
  mediaAssetId: string
  imageUrl: string
}

const MAX_BYTES = 10 * 1024 * 1024
export const MAX_REEL_PHOTOS = 5

interface Props {
  value: ReelSource | null
  onChange: (s: ReelSource | null) => void
  extras: ReelExtra[]
  onExtrasChange: (e: ReelExtra[]) => void
}

export function ImagePicker({ value, onChange, extras, onExtrasChange }: Props) {
  const t = useT()
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    listProducts(1, 50)
      .then((p) => live && setProducts(p.items.filter((x) => x.imageUrl)))
      .catch((e: unknown) => {
        if (!live) return
        setProducts([])
        setError(errorMessage(e))
      })
    return () => {
      live = false
    }
  }, [])

  const total = (value ? 1 : 0) + extras.length
  const full = total >= MAX_REEL_PHOTOS

  /** The first photo becomes the main one; every later photo is added to the extras, up to five in all. */
  const upload = async (list: FileList | File[] | undefined) => {
    const files = Array.from(list ?? [])
    if (files.length === 0) return
    setError(null)
    setUploading(true)
    let main = value
    let more = extras
    try {
      for (const f of files) {
        if ((main ? 1 : 0) + more.length >= MAX_REEL_PHOTOS) {
          setError(translate('reels.picker.tooMany', { max: MAX_REEL_PHOTOS }))
          break
        }
        if (!f.type.startsWith('image/')) {
          setError(translate('reels.picker.notImage'))
          continue
        }
        if (f.size > MAX_BYTES) {
          setError(translate('reels.picker.tooBig'))
          continue
        }
        const asset = await uploadPhoto(f)
        if (main) {
          more = [...more, { mediaAssetId: asset.id, imageUrl: asset.secureUrl }]
          onExtrasChange(more)
        } else {
          main = { mediaAssetId: asset.id, imageUrl: asset.secureUrl, label: '' }
          onChange(main)
        }
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
      if (file.current) file.current.value = ''
    }
  }

  const drop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!full) void upload(e.dataTransfer.files)
  }

  /** Removing the main photo promotes the next one, so the Reel always has a main photo while any are left. */
  const removeMain = () => {
    const [next, ...rest] = extras
    onExtrasChange(rest)
    onChange(next ? { mediaAssetId: next.mediaAssetId, imageUrl: next.imageUrl, label: '' } : null)
  }

  return (
    <div className="photo-step">
      {error ? <Banner tone="error">{error}</Banner> : null}
      {value ? (
        <div className="photo-chosen">
          <img src={value.imageUrl} alt={value.label || t('reels.picker.selectedPhoto')} />
          <div className="photo-chosen-text">
            <strong>{value.label || t('reels.picker.yourPhoto')}</strong>
            <span className="pill-ok" role="status"><Icon name="check" size={14} strokeWidth={3} /> {t('reels.picker.imageReady')}</span>
          </div>
          <button type="button" className="photo-remove" onClick={removeMain} aria-label={t('reels.picker.removePhoto')}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}
      {extras.length > 0 ? (
        <ul className="photo-extras" aria-label={t('reels.picker.morePhotos')}>
          {extras.map((x, i) => (
            <li key={x.mediaAssetId}>
              <img src={x.imageUrl} alt={t('reels.picker.photoN', { n: i + 2 })} />
              <button type="button" className="photo-remove" onClick={() => onExtrasChange(extras.filter((e) => e.mediaAssetId !== x.mediaAssetId))} aria-label={t('reels.picker.removePhotoN', { n: i + 2 })}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value ? <small className="photo-count">{t('reels.picker.photoCount', { total, max: MAX_REEL_PHOTOS })}</small> : null}
      <button
        type="button"
        className={`dropzone ${dragging ? 'is-over' : ''}`}
        onClick={() => file.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        disabled={uploading || full}
      >
        {uploading ? <span className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} aria-hidden="true" /> : <Icon name="upload" size={28} />}
        <strong>{uploading ? t('reels.picker.uploading') : full ? t('reels.picker.added5') : value ? t('reels.picker.addMore') : t('reels.picker.dragDrop')}</strong>
        <span>{t('reels.picker.clickUpload')}</span>
        <small>{t('reels.picker.supports')}</small>
      </button>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files ?? undefined)} aria-label={t('reels.picker.uploadAria')} />
      <PhotoTips />
      {products === null ? (
        <Spinner />
      ) : products.length > 0 ? (
        <div className="photo-products">
          <span className="photo-products-label" id="pp-label">{t('reels.picker.pickProduct')}</span>
          <div className="photo-products-row" role="radiogroup" aria-labelledby="pp-label" onKeyDown={radioKeys}>
            {products.map((p, i) => {
              const selected = value?.productId === p.id
              const tab = selected || (!value?.productId && i === 0)
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={tab ? 0 : -1}
                  className={`pp-item ${selected ? 'is-selected' : ''}`}
                  onClick={() => onChange({ productId: p.id, imageUrl: p.imageUrl!, label: p.name, price: p.price })}
                >
                  <img src={p.imageUrl!} alt="" loading="lazy" />
                  <span>{p.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
