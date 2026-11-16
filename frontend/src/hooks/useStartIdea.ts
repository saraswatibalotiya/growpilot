import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { usePostFlow } from '../state/PostFlowContext'

/**
 * "Use This": starts a new post from a recommended idea. The idea becomes the editable prompt on the
 * existing Create screen. Nothing is generated or posted here.
 */
export function useStartIdea() {
  const navigate = useNavigate()
  const { business } = useAuth()
  const { reset, update } = usePostFlow()
  return useCallback(
    (prompt: string) => {
      reset(business?.preferredLanguage ?? 'en')
      update({ transcript: prompt, inputSource: 'text' })
      navigate('/create')
    },
    [business, navigate, reset, update],
  )
}
