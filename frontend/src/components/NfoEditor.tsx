import { useState, useEffect } from 'react'
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Skeleton } from "@heroui/react";
import { mediaApi, MovieNfo } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'

interface NfoEditorProps {
  fileId: string
  visible: boolean
  onClose: () => void
}

export default function NfoEditor({ fileId, visible, onClose }: NfoEditorProps) {
  const [formData, setFormData] = useState<Partial<MovieNfo>>({})

  const { data: nfo, isLoading, isError } = useQuery({
    queryKey: ['nfo', fileId],
    queryFn: async () => {
      const res = await mediaApi.getNfo(fileId)
      return res
    },
    enabled: visible && !!fileId
  })

  useEffect(() => {
    if (nfo) {
      setFormData(nfo)
    }
  }, [nfo])

  const mutation = useMutation({
    mutationFn: (values: MovieNfo) => mediaApi.updateNfo(fileId, values),
    onSuccess: () => {
      onClose()
    }
  })

  const handleSave = () => {
    if (formData.title) {
      mutation.mutate(formData as MovieNfo)
    }
  }

  const handleChange = (key: keyof MovieNfo, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Modal
      isOpen={visible}
      onClose={onClose}
      size="2xl"
      backdrop="blur"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Edit NFO Metadata</ModalHeader>
            <ModalBody>
              {isLoading ? (
                <div className="flex flex-col gap-4">
                  <Skeleton className="rounded-lg h-12 w-full" />
                  <Skeleton className="rounded-lg h-12 w-full" />
                  <div className="flex gap-4">
                    <Skeleton className="rounded-lg h-12 w-1/2" />
                    <Skeleton className="rounded-lg h-12 w-1/2" />
                  </div>
                </div>
              ) : isError ? (
                <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">
                  NFO file not found. Please scrape the file first.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <Input
                    label="Title"
                    placeholder="Enter movie title"
                    value={formData.title || ''}
                    onValueChange={(v) => handleChange('title', v)}
                    isRequired
                    isInvalid={!formData.title && mutation.isPending} // Simple validation visual
                  />
                  <Input
                    label="Original Title"
                    placeholder="Original title"
                    value={formData.originaltitle || ''}
                    onValueChange={(v) => handleChange('originaltitle', v)}
                  />
                  <div className="flex gap-4">
                    <Input
                      label="Year"
                      placeholder="2025"
                      value={formData.year?.toString() || ''}
                      onValueChange={(v) => handleChange('year', v)}
                      type="number"
                    />
                    <Input
                      label="Rating"
                      placeholder="8.5"
                      value={formData.rating?.toString() || ''}
                      onValueChange={(v) => handleChange('rating', v)}
                      type="number"
                      step="0.1"
                    />
                  </div>
                  <Textarea
                    label="Plot"
                    placeholder="Movie summary..."
                    value={formData.plot || ''}
                    onValueChange={(v) => handleChange('plot', v)}
                    minRows={4}
                  />
                  <Input
                    label="TMDB ID"
                    placeholder="123456"
                    value={formData.tmdbid?.toString() || ''}
                    onValueChange={(v) => handleChange('tmdbid', v)}
                  />
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                onPress={handleSave}
                isLoading={mutation.isPending}
                isDisabled={isError || isLoading}
              >
                Save Metadata
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
