import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Banner, Button, Card, EmptyState, Field, Spinner } from '../components/ui'
import { useT } from '../i18n'
import { errorMessage } from '../lib/api'
import type { Product } from '../lib/types'
import { uploadPhoto } from '../services/media'
import { createProduct, deleteProduct, listProducts, updateProduct } from '../services/products'

function ProductForm({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(product?.price ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '')
  const [available, setAvailable] = useState(product?.isAvailable ?? true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const priceError = price && !/^\d{1,10}(\.\d{1,2})?$/.test(price) ? t('products.form.priceError') : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const input = {
      name: name.trim(),
      ...(price ? { price } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      isAvailable: available,
    }
    try {
      if (product) await updateProduct(product.id, input)
      else await createProduct(input)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={product ? t('products.form.editTitle') : t('products.form.addLabel')}>
      <form className="modal" onSubmit={submit}>
        <div className="row-between" style={{ marginBottom: 18 }}>
          <h2>{product ? t('products.form.editTitle') : t('products.form.addTitle')}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={t('products.form.close')}>
            {t('products.form.close')}
          </Button>
        </div>
        {error ? <div style={{ marginBottom: 14 }}><Banner tone="error">{error}</Banner></div> : null}
        <Field label={t('products.form.name')} htmlFor="p-name">
          <input id="p-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="two-col">
          <Field label={t('products.form.price')} htmlFor="p-price" error={priceError}>
            <input id="p-price" className="input" inputMode="decimal" value={price} aria-invalid={Boolean(priceError)} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label={t('products.form.category')} htmlFor="p-cat">
            <input id="p-cat" className="input" placeholder={t('products.form.categoryPlaceholder')} value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
        </div>
        <Field label={t('products.form.description')} htmlFor="p-desc">
          <textarea id="p-desc" className="textarea" style={{ minHeight: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="field">
          <label>{t('products.form.photo')}</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="thumb" style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}>{imageUrl ? null : <Icon name="camera" />}</div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon="upload"
              loading={uploading}
              onClick={() => file.current?.click()}
            >
              {imageUrl ? t('products.form.replace') : t('products.form.upload')}
            </Button>
            <input
              ref={file}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setUploading(true)
                setError(null)
                try {
                  setImageUrl((await uploadPhoto(f)).secureUrl)
                } catch (err) {
                  setError(errorMessage(err))
                } finally {
                  setUploading(false)
                }
              }}
            />
          </div>
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '4px 0 20px', fontWeight: 600 }}>
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} /> {t('products.form.available')}
        </label>
        <Button type="submit" size="lg" block loading={busy} disabled={!name.trim() || Boolean(priceError)}>
          {product ? t('products.form.save') : t('products.form.add')}
        </Button>
      </form>
    </div>
  )
}

export function ProductsPage() {
  const t = useT()
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Product | null | 'new'>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setProducts((await listProducts(1, 50)).items)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const remove = async (p: Product) => {
    if (!window.confirm(t('products.confirmDelete', { name: p.name }))) return
    try {
      await deleteProduct(p.id)
      await load()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>{t('products.title')}</h1>
          <p>{t('products.subtitle')}</p>
        </div>
        <Button icon="plus" onClick={() => setEditing('new')}>
          {t('products.form.add')}
        </Button>
      </div>
      {error ? <div style={{ marginBottom: 16 }}><Banner tone="error">{error}</Banner></div> : null}
      {products === null && !error ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}><Spinner /></div>
      ) : products && products.length === 0 ? (
        <Card>
          <EmptyState icon="box" title={t('products.empty.title')} action={<Button icon="plus" onClick={() => setEditing('new')}>{t('products.empty.action')}</Button>}>
            {t('products.empty.hint')}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid-products">
          {products?.map((p) => (
            <Card pad={false} className="product-card" key={p.id}>
              <div className="thumb-lg" style={p.imageUrl ? { backgroundImage: `url("${p.imageUrl}")` } : undefined}>{p.imageUrl ? null : <Icon name="box" size={32} />}</div>
              <div className="body">
                <h3>{p.name}</h3>
                <div className="row-between">
                  <span className="price">{p.price ? `₹${p.price}` : t('products.noPrice')}</span>
                  <span className={`badge ${p.isAvailable ? 'badge-success' : 'badge-neutral'}`}>{p.isAvailable ? t('products.availableBadge') : t('products.hidden')}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(p)}>{t('products.edit')}</Button>
                  <Button size="sm" variant="ghost" icon="trash" onClick={() => void remove(p)} aria-label={t('products.deleteName', { name: p.name })}>{t('products.delete')}</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing ? (
        <ProductForm
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      ) : null}
    </>
  )
}
