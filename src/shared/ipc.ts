export const IPC_CHANNELS = {
  APP_INFO: "app:info",
  APP_PATHS: "app:paths",
  DATA_LOCATION_CHOOSE: "data-location:choose",
  DATA_LOCATION_CHANGE: "data-location:change",
  SETTINGS_GET: "settings:get",
  SETTINGS_SAVE: "settings:save",
  SETTINGS_TEST_CHAT: "settings:test-chat",
  SETTINGS_TEST_EMBEDDING: "settings:test-embedding",
  SETTINGS_LIST_MODELS: "settings:list-models",
  EMBEDDINGS_STATUS: "embeddings:status",
  EMBEDDINGS_REBUILD: "embeddings:rebuild",
  EMBEDDINGS_PROGRESS: "embeddings:progress",
  DOCUMENTS_LIST: "documents:list",
  DOCUMENTS_IMPORT_DIALOG: "documents:import-dialog",
  DOCUMENTS_IMPORT_PATHS: "documents:import-paths",
  DOCUMENTS_REMOVE: "documents:remove",
  DOCUMENTS_TOC: "documents:toc",
  DOCUMENTS_ASSET: "documents:asset",
  IMPORT_PROGRESS: "import:progress",
  CONVERSATIONS_LIST: "conversations:list",
  CONVERSATIONS_GET: "conversations:get",
  CONVERSATIONS_DELETE: "conversations:delete",
  CHAT_ASK: "chat:ask",
  CHAT_EVENT: "chat:event",
  IMAGES_MATCH: "images:match"
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
