import { createEphemeralDatabase, closeEphemeralDatabase } from "./test-db";

const globalSetup = async () => {
  const { url } = await createEphemeralDatabase();
  process.env.DATABASE_URL = url;

  return async () => {
    await closeEphemeralDatabase();
  };
};

export default globalSetup;
