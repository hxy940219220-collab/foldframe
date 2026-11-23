'use client'

import type { ChangeEvent, RefObject } from 'react'
import type { MediaMentionItem } from '../MediaMentionPromptInput'
import type { IUploadedMedia } from '@/components/Chat/MediaUpload'
import { History, Maximize2, Plus, RotateCcw, X } from 'lucide-react'
import { usePlanDetailStore } from '@/store/draft-box/planDetailStore'
import { InspirationLink } from './InspirationLink'
import ImageStack from '../ImageStack'
import MediaMentionPromptInput from '../MediaMentionPromptInput'

interface PromptComposerLabels {
  history: string
  heading: string
  addReference: string
  limits: string
  explore: string
  clear: string
  missingMedia: string
  emptyMedia: string
  emptyMediaHint: string
  loading: string
  uploadMedia: string
  resetConfig: string
  openPromptEditor: string
}

interface PromptComposerProps {
  uploadInputRef: RefObject<HTMLInputElement>
  mediaAccept: string
  localMedias: IUploadedMedia[]
  canUploadImage: boolean
  canUploadVideo: boolean
  canUploadAudio: boolean
  inspirationUrl?: string
  promptValue: string
  placeholder: string
  maxLength: number
  mediaMentions: MediaMentionItem[]
  labels: PromptComposerLabels
  onUploadInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  onLocalMediaRemove: (index: number) => void
  onLocalUpload: (files: FileList) => void
  onPromptChange: (value: string) => void
  onPasteFiles: (files: FileList) => void
  onRequestUpload: () => void
  onReset: () => void
  onOpenPromptEditor: () => void
  onClear: () => void
}

export function PromptComposer({
  uploadInputRef,
  mediaAccept,
  localMedias,
  canUploadImage,
  canUploadVideo,
  canUploadAudio,
  promptValue,
  inspirationUrl,
  placeholder,
  maxLength,
  mediaMentions,
  labels,
  onUploadInputChange,
  onLocalMediaRemove,
  onLocalUpload,
  onPromptChange,
  onPasteFiles,
  onRequestUpload,
  onReset,
  onOpenPromptEditor,
  onClear,
}: PromptComposerProps) {
  const openHistory = usePlanDetailStore(state => state.openGenerationDetailDialog)
  const canUploadAny = canUploadImage || canUploadVideo || canUploadAudio

  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        accept={mediaAccept}
        multiple
        className="hidden"
        onChange={onUploadInputChange}
      />

      <div className="composer-body">
        <div className="composer-main">
          {localMedias.length > 0 ? (
            <div className="composer-media-slot">
              <ImageStack
                localMedias={localMedias}
                onLocalMediaRemove={onLocalMediaRemove}
                onLocalUpload={onLocalUpload}
                canUploadImage={canUploadImage}
                canUploadVideo={canUploadVideo}
                canUploadAudio={canUploadAudio}
                accept={mediaAccept}
              />
            </div>
          ) : canUploadAny ? (
            <button
              type="button"
              className="composer-add-tile"
              title={labels.limits || labels.addReference}
              aria-label={labels.addReference}
              onClick={onRequestUpload}
            >
              <Plus size={18} strokeWidth={2.2} />
              <span>参考图</span>
            </button>
          ) : null}

          <div className="composer-input-wrap">
            <MediaMentionPromptInput
              testId="draftbox-ai-prompt-input"
              value={promptValue}
              placeholder={placeholder}
              maxLength={maxLength}
              mediaMentions={mediaMentions}
              onChange={onPromptChange}
              onPasteFiles={onPasteFiles}
              onRequestUpload={onRequestUpload}
              missingMediaLabel={labels.missingMedia}
              emptyMediaLabel={labels.emptyMedia}
              emptyMediaHintLabel={labels.emptyMediaHint}
              loadingLabel={labels.loading}
              uploadMediaLabel={labels.uploadMedia}
              editorClassName="min-h-[58px] max-h-36 overflow-auto text-[15px] leading-6 pr-24"
              placeholderClassName="text-[15px] leading-6 pr-24"
              minRows={2}
            />

            <div className="composer-utilities">
              <button type="button" title={labels.history} onClick={openHistory}><History size={14} /></button>
              <button type="button" data-testid="draftbox-ai-reset-btn" title={labels.resetConfig} onClick={onReset}><RotateCcw size={14} /></button>
              <button type="button" data-testid="draftbox-ai-open-prompt-editor-btn" title={labels.openPromptEditor} onClick={onOpenPromptEditor}><Maximize2 size={14} /></button>
              {promptValue && <button type="button" data-testid="draftbox-ai-clear-btn" title={labels.clear} onClick={onClear}><X size={14} /></button>}
            </div>
          </div>
        </div>

        {(inspirationUrl || promptValue.length > 0) && (
          <div className="composer-accessories">
            {inspirationUrl && <InspirationLink label={labels.explore} url={inspirationUrl} />}
            {promptValue.length > 0 && <span className="composer-count">{promptValue.length} / {maxLength}</span>}
          </div>
        )}
      </div>
    </>
  )
}
