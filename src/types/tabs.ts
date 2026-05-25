export interface OpenTab {
  documentId: string;
  title: string;
}

export interface TabSession {
  tabs: OpenTab[];
  activeTabId: string | null;
}
