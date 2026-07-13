import { createEphemeralDatabase, closeEphemeralDatabase } from "./test-db";

const globalSetup = async () => {
  if (!process.env.DATABASE_URL) {
    return;
  }
  try {
    const { url } = await createEphemeralDatabase();
    process.env.DATABASE_URL = url;
  } catch {
    return;
  }

  return async () => {
    await closeEphemeralDatabase();
  };
};

export default globalSetup;
