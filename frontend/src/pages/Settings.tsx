import { useState } from 'react'
import { Card, CardBody, CardHeader, Button, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Switch, Tabs, Tab, Divider } from "@heroui/react";
import { Plus, Trash, Settings as SettingsIcon, Monitor, Clock, Save } from 'react-feather'
import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'

interface WatchFolder {
  id: string
  path: string
  auto_scrape: boolean
  auto_rename: boolean
  enabled: boolean
}

export default function Settings() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newFolderData, setNewFolderData] = useState<Partial<WatchFolder>>({
    auto_scrape: true,
    auto_rename: false,
    enabled: true
  })

  // Placeholder for Basic Config Form State
  const [basicConfig, setBasicConfig] = useState({
    tmdb_api_key: '',
    default_dir: ''
  })

  const { data: watchFolders, refetch } = useQuery({
    queryKey: ['watch-folders'],
    queryFn: async () => {
      const res = await axios.get<WatchFolder[]>('/api/watch-folders')
      return res
    }
  })

  const addMutation = useMutation({
    mutationFn: (values: any) => axios.post('/api/watch-folders', values),
    onSuccess: () => {
      setIsModalOpen(false)
      setNewFolderData({ auto_scrape: true, auto_rename: false, enabled: true })
      refetch()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/watch-folders/${id}`),
    onSuccess: () => refetch()
  })

  const handleAddFolder = () => {
    if (newFolderData.path) {
      addMutation.mutate(newFolderData)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">System Settings</h2>
        <p className="text-default-500">Manage configuration, automation, and tasks</p>
      </div>

      <div className="flex w-full flex-col">
        <Tabs aria-label="Settings Options" color="primary" variant="underlined">
          <Tab
            key="general"
            title={
              <div className="flex items-center space-x-2">
                <SettingsIcon size={16} />
                <span>General</span>
              </div>
            }
          >
            <Card className="mt-4">
              <CardHeader>
                <h3 className="font-bold">Basic Configuration</h3>
              </CardHeader>
              <Divider />
              <CardBody className="gap-6 max-w-2xl">
                <Input
                  label="TMDB API Key"
                  type="password"
                  placeholder="Enter your API key"
                  value={basicConfig.tmdb_api_key}
                  onValueChange={(v) => setBasicConfig({ ...basicConfig, tmdb_api_key: v })}
                />
                <Input
                  label="Default Scan Directory"
                  placeholder="/path/to/media"
                  value={basicConfig.default_dir}
                  onValueChange={(v) => setBasicConfig({ ...basicConfig, default_dir: v })}
                />
                <Button color="primary" className="w-fit" startContent={<Save size={18} />}>
                  Save Configuration
                </Button>
              </CardBody>
            </Card>
          </Tab>

          <Tab
            key="watcher"
            title={
              <div className="flex items-center space-x-2">
                <Monitor size={16} />
                <span>Automation (Watcher)</span>
              </div>
            }
          >
            <Card className="mt-4">
              <CardHeader className="flex justifies-between items-center">
                <div className="flex flex-col">
                  <h3 className="font-bold">Real-time Directory Monitoring</h3>
                  <p className="text-small text-default-500">Automatically analyze items when file system changes are detected.</p>
                </div>
                <Button
                  color="primary"
                  size="sm"
                  onPress={() => setIsModalOpen(true)}
                  startContent={<Plus size={16} />}
                  className="ml-auto"
                >
                  Add Watch Folder
                </Button>
              </CardHeader>
              <Divider />
              <CardBody>
                <Table aria-label="Watch Folders" removeWrapper>
                  <TableHeader>
                    <TableColumn>PATH</TableColumn>
                    <TableColumn>AUTO SCRAPE</TableColumn>
                    <TableColumn>STATUS</TableColumn>
                    <TableColumn>ACTION</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent="No watch folders configured.">
                    {(watchFolders || []).map((folder: WatchFolder) => (
                      <TableRow key={folder.id}>
                        <TableCell><span className="font-mono text-sm">{folder.path}</span></TableCell>
                        <TableCell>
                          <Chip size="sm" variant="flat" color={folder.auto_scrape ? "success" : "default"}>
                            {folder.auto_scrape ? "On" : "Off"}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <Chip size="sm" variant="dot" color={folder.enabled ? "success" : "danger"}>
                            {folder.enabled ? "Running" : "Disabled"}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <Button
                            isIconOnly
                            color="danger"
                            variant="light"
                            size="sm"
                            onPress={() => deleteMutation.mutate(folder.id)}
                          >
                            <Trash size={16} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardBody>
            </Card>
          </Tab>

          <Tab
            key="scheduler"
            title={
              <div className="flex items-center space-x-2">
                <Clock size={16} />
                <span>Scheduled Tasks</span>
              </div>
            }
          >
            <Card className="mt-4">
              <CardHeader>
                <h3 className="font-bold">Task Scheduler</h3>
              </CardHeader>
              <Divider />
              <CardBody className="gap-6">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold">Daily Library Cleanup</span>
                    <span className="text-small text-default-500">Automatically remove invalid records and empty folders at 3:00 AM daily.</span>
                  </div>
                  <Switch defaultSelected color="primary" />
                </div>
                <Divider />
                <div className="flex justify-between items-center">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold">Weekly Quality Score Update</span>
                    <span className="text-small text-default-500">Recalculate quality scores based on latest TMDB data and rules.</span>
                  </div>
                  <Switch defaultSelected color="primary" />
                </div>
              </CardBody>
            </Card>
          </Tab>
        </Tabs>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        backdrop="blur"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Add Watch Folder</ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <Input
                    label="Path"
                    placeholder="/volume1/downloads"
                    value={newFolderData.path || ''}
                    onValueChange={(v) => setNewFolderData({ ...newFolderData, path: v })}
                    isRequired
                  />
                  <div className="flex justify-between items-center bg-default-100 p-3 rounded-lg">
                    <span className="text-sm">Auto Scrape</span>
                    <Switch
                      isSelected={newFolderData.auto_scrape}
                      onValueChange={(v) => setNewFolderData({ ...newFolderData, auto_scrape: v })}
                      size="sm"
                    />
                  </div>
                  <div className="flex justify-between items-center bg-default-100 p-3 rounded-lg">
                    <span className="text-sm">Auto Rename</span>
                    <Switch
                      isSelected={newFolderData.auto_rename}
                      onValueChange={(v) => setNewFolderData({ ...newFolderData, auto_rename: v })}
                      size="sm"
                    />
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleAddFolder} isLoading={addMutation.isPending}>
                  Add Folder
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  )
}
