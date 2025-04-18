import { environment } from "@raycast/api";
import { useEffect, useState } from "react";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import fsSync from "node:fs";

const extensionFolder = path.join(
  os.homedir(),
  "Library",
  "Mobile Documents",
  "com~apple~CloudDocs",
  "Raycast",
  environment.extensionName
);

export function useICloudStorage<T>(key: string, initialValue?: T): {
  value: T | undefined;
  setValue: (value: T) => Promise<void>;
  isLoading: boolean;
} {
  const [isLoading, setIsLoading] = useState(true);
  const [value, setValue] = useState(initialValue || ({} as T));

  const storageFilePath = path.join(extensionFolder, key);

  async function ensureStorageFileAccessible() {
    await fs.mkdir(extensionFolder, { recursive: true });
    try {
      await fs.access(storageFilePath);
    } catch {
      await writeToStorageFile(value);
    }
  }

  useEffect(() => {

      setIsLoading(true);

      ensureStorageFileAccessible().then(async () => {
        const initialValueLoadedFromIcloud = await readFromStorageFile();
        setValue(initialValueLoadedFromIcloud);
      }).finally(() => setIsLoading(false));

      const watcher = fsSync.watch(extensionFolder, { persistent: true},  async (evt, filename) => {
        if (filename !== path.basename(storageFilePath)) {
          return;
        }

        const newValue = await readFromStorageFile();
        setValue(newValue);
      });

      return () => watcher.close();
  }, []);

  useEffect(() => {
    // when value changes, actually write it to iCloud
    writeToStorageFile(value);
  }, [value]);

  async function writeToStorageFile(newValue: T) {
    await fs.writeFile(storageFilePath, JSON.stringify(newValue), "utf8");
  }

  async function readFromStorageFile() {
    await ensureStorageFileAccessible();
    const rawJson = await fs.readFile(storageFilePath, "utf8")
    return JSON.parse(rawJson) as T;
  }

  return {
    value,
    setValue: async (newValue: T) => setValue(await newValue),
    isLoading,
  };
}
