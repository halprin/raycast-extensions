import { environment } from "@raycast/api";
import { useEffect, useState, useRef } from "react";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import crypto from "node:crypto";

const extensionFolder = path.join(
  os.homedir(),
  "Library",
  "Mobile Documents",
  "com~apple~CloudDocs",
  "Raycast",
  environment.extensionName
);

function sha256(content: string | Buffer) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function useICloudStorage<T>(key: string, initialValue?: T): {
  value: T | undefined;
  setValue: (value: T) => Promise<void>;
  isLoading: boolean;
} {
  const [isLoading, setIsLoading] = useState(true);
  const [value, setValue] = useState(initialValue || ({} as T));
  const lastHash = useRef<string | null>(null);

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

    //TODO: without the folder/file structure existing, this below command throws an exception.  Need to somehow kill the watcher on offload but also call ensure the file structure exists beforehand.
    //TODO: Maybe somehow use the async version of watcher?
    const watcher = fsSync.watch(extensionFolder, { persistent: true},  async (evt, filename) => {
      if (filename !== path.basename(storageFilePath)) {
        return;
      }

      const currentHash = await hashOfStorageFile();
      if (currentHash === lastHash.current) {
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
    const rawJson = JSON.stringify(newValue);
    lastHash.current = sha256(rawJson);
    await fs.writeFile(storageFilePath, rawJson, "utf8");
  }

  async function readFromStorageFile(): Promise<T> {
    const rawJson = await fs.readFile(storageFilePath, "utf8")
    return JSON.parse(rawJson) as T;
  }

  async function hashOfStorageFile(): Promise<string> {
    const rawJson = await fs.readFile(storageFilePath, "utf8")
    return sha256(rawJson);
  }

  return {
    value,
    setValue: async (newValue: T) => setValue(await newValue),
    isLoading,
  };
}
