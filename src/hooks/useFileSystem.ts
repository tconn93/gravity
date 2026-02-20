import { useState, useCallback } from 'react'
import type { FileNode } from '../types'

interface FileSystemState {
  loading: boolean
  error: string | null
}

export function useFileSystem() {
  const [state, setState] = useState<FileSystemState>({ loading: false, error: null })

  const openFolder = useCallback(async (): Promise<string | null> => {
    setState({ loading: true, error: null })
    try {
      const path = await window.electronAPI.openFolder()
      setState({ loading: false, error: null })
      return path
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open folder'
      setState({ loading: false, error: message })
      return null
    }
  }, [])

  const readDir = useCallback(async (path: string): Promise<FileNode[]> => {
    setState({ loading: true, error: null })
    try {
      const nodes = await window.electronAPI.readDir(path)
      setState({ loading: false, error: null })
      return nodes
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read directory'
      setState({ loading: false, error: message })
      return []
    }
  }, [])

  const readFile = useCallback(async (path: string): Promise<string> => {
    setState({ loading: true, error: null })
    try {
      const content = await window.electronAPI.readFile(path)
      setState({ loading: false, error: null })
      return content
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file'
      setState({ loading: false, error: message })
      return ''
    }
  }, [])

  const writeFile = useCallback(async (path: string, content: string): Promise<void> => {
    setState({ loading: true, error: null })
    try {
      await window.electronAPI.writeFile(path, content)
      setState({ loading: false, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to write file'
      setState({ loading: false, error: message })
    }
  }, [])

  return {
    ...state,
    openFolder,
    readDir,
    readFile,
    writeFile
  }
}
