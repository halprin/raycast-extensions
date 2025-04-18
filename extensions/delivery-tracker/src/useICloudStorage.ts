import { environment } from "@raycast/api";
import { useEffect, useState, useRef } from "react";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
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
    const abortController = new AbortController();
    const { signal } = abortController;
    const identifier = crypto.randomUUID();

    (async () => {
      try {
        console.log(`Loading initial value with ID ${identifier}`);
        //TODO: somewhere in here, when I edit the file, the new value is loaded (good), but then when I go away from the extension and come back, the original value is back and the file written reverts to the original file too (bad).
        await ensureStorageFileAccessible();
        const initialValueLoadedFromIcloud = await readFromStorageFile();
        setValue(initialValueLoadedFromIcloud);

        const watcher = fs.watch(extensionFolder, { persistent: false, signal });

        for await (const { filename } of watcher) {
          console.log(`Watch triggered for ID ${identifier}`);
          if (filename !== path.basename(storageFilePath)) {
            continue;
          }

          const currentHash = await hashOfStorageFile();
          if (currentHash === lastHash.current) {
            continue;
          }

          const newValue = await readFromStorageFile();
          setValue(newValue);
        }
        console.log(`right outside the for await loop for ID ${identifier}`)
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log(`Watch aborted for ID ${identifier}`);
          return;
        }
        console.error('Watch error:', error, 'for ID', identifier);
        throw error;
      } finally {
        console.log(`Loading done for ID ${identifier}`);
        setIsLoading(false);
      }
    })();

    return () => {
      console.log(`Cleaning up watch with ID ${identifier}`);
      abortController.abort();
    };
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
