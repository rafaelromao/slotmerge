import { createEphemeralDatabase, closeEphemeralDatabase } from "./test-db";

type GlobalSetupProject = {
  provide: (key: "testDbUrl", value: string) => void;
};

const DEFAULT_DATABASE_URL =
  "postgres://slotmerge:slotmerge@localhost:5432/slotmerge";

const globalSetup = async (project: GlobalSetupProject) => {
  // The vitest env config is applied to worker processes but not to the
  // main process that runs globalSetup. Default to the same value the
  // vitest config uses so the main process can connect when the caller
  // did not export DATABASE_URL.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
  }
  let url: string;
  try {
    const created = await createEphemeralDatabase();
    url = created.url;
  } catch {
    return;
  }
  project.provide("testDbUrl", url);

  return async () => {
    await closeEphemeralDatabase();
  };
};

export default globalSetup;
