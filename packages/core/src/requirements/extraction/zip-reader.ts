/**
 * @file packages/core/src/requirements/extraction/zip-reader.ts
 * Safe in-memory ZIP archive reader with ZIP-slip and decompression-bomb protections.
 */

import zlib from 'node:zlib';
import { EXTRACTION_LIMITS } from './extraction-types.js';
import {
  DocumentFormatError,
  DocumentExtractionLimitExceededError,
} from '../requirement-errors.js';

export interface ZipEntry {
  readonly name: string;
  readonly uncompressedSize: number;
  getData(): Buffer;
}

export class SafeZipReader {
  private readonly buffer: Buffer;
  private readonly entries: Map<string, ZipEntry> = new Map();

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.parse();
  }

  getEntry(name: string): ZipEntry | undefined {
    return this.entries.get(name);
  }

  getEntryNames(): string[] {
    return Array.from(this.entries.keys());
  }

  private parse(): void {
    const buf = this.buffer;
    if (buf.length < 22) {
      throw new DocumentFormatError('Invalid archive: file too small for ZIP format.');
    }

    // Locate End of Central Directory Record (EOCD) from the end
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= 0 && i >= buf.length - 65557; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      // Fallback to sequential local header scanning
      this.parseLocalHeaders();
      return;
    }

    const totalEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdSize = buf.readUInt32LE(eocdOffset + 12);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);

    if (totalEntries > EXTRACTION_LIMITS.maxDocxZipEntries) {
      throw new DocumentExtractionLimitExceededError(
        `Archive entry count (${totalEntries}) exceeds safety limit of ${EXTRACTION_LIMITS.maxDocxZipEntries}.`,
      );
    }

    if (cdOffset + cdSize > buf.length) {
      throw new DocumentFormatError('Corrupted ZIP central directory offset.');
    }

    let offset = cdOffset;
    let totalDecompressedBytes = 0;

    for (let i = 0; i < totalEntries && offset < cdOffset + cdSize; i++) {
      if (buf.readUInt32LE(offset) !== 0x02014b50) {
        break;
      }

      const compressionMethod = buf.readUInt16LE(offset + 10);
      const compressedSize = buf.readUInt32LE(offset + 20);
      const uncompressedSize = buf.readUInt32LE(offset + 24);
      const nameLength = buf.readUInt16LE(offset + 28);
      const extraLength = buf.readUInt16LE(offset + 30);
      const commentLength = buf.readUInt16LE(offset + 32);
      const localHeaderOffset = buf.readUInt32LE(offset + 42);

      const nameBytes = buf.subarray(offset + 46, offset + 46 + nameLength);
      const entryName = nameBytes.toString('utf8');

      // ZIP Slip Protection
      if (entryName.includes('..') || entryName.startsWith('/') || entryName.startsWith('\\')) {
        throw new DocumentFormatError(`Malicious entry name in archive: '${entryName}'.`);
      }

      totalDecompressedBytes += uncompressedSize;
      if (totalDecompressedBytes > EXTRACTION_LIMITS.maxDocxDecompressedBytes) {
        throw new DocumentExtractionLimitExceededError(
          `Decompressed archive size exceeds limit of ${EXTRACTION_LIMITS.maxDocxDecompressedBytes} bytes.`,
        );
      }

      // Capture entry getter
      this.entries.set(entryName, {
        name: entryName,
        uncompressedSize,
        getData: () => {
          return this.readLocalData(
            localHeaderOffset,
            compressionMethod,
            compressedSize,
            uncompressedSize,
          );
        },
      });

      offset += 46 + nameLength + extraLength + commentLength;
    }
  }

  private parseLocalHeaders(): void {
    const buf = this.buffer;
    let offset = 0;
    let entryCount = 0;
    let totalDecompressedBytes = 0;

    while (offset + 30 <= buf.length) {
      const sig = buf.readUInt32LE(offset);
      if (sig !== 0x04034b50) {
        break;
      }

      entryCount++;
      if (entryCount > EXTRACTION_LIMITS.maxDocxZipEntries) {
        throw new DocumentExtractionLimitExceededError(
          `Archive entry count exceeds safety limit of ${EXTRACTION_LIMITS.maxDocxZipEntries}.`,
        );
      }

      const compressionMethod = buf.readUInt16LE(offset + 8);
      const compressedSize = buf.readUInt32LE(offset + 18);
      const uncompressedSize = buf.readUInt32LE(offset + 22);
      const nameLength = buf.readUInt16LE(offset + 26);
      const extraLength = buf.readUInt16LE(offset + 28);

      const nameBytes = buf.subarray(offset + 30, offset + 30 + nameLength);
      const entryName = nameBytes.toString('utf8');

      // ZIP Slip Protection
      if (entryName.includes('..') || entryName.startsWith('/') || entryName.startsWith('\\')) {
        throw new DocumentFormatError(`Malicious entry name in archive: '${entryName}'.`);
      }

      totalDecompressedBytes += uncompressedSize;
      if (totalDecompressedBytes > EXTRACTION_LIMITS.maxDocxDecompressedBytes) {
        throw new DocumentExtractionLimitExceededError(
          `Decompressed archive size exceeds limit of ${EXTRACTION_LIMITS.maxDocxDecompressedBytes} bytes.`,
        );
      }

      const dataOffset = offset + 30 + nameLength + extraLength;
      const capturedOffset = offset;

      this.entries.set(entryName, {
        name: entryName,
        uncompressedSize,
        getData: () => {
          return this.readLocalData(
            capturedOffset,
            compressionMethod,
            compressedSize,
            uncompressedSize,
          );
        },
      });

      offset = dataOffset + compressedSize;
    }
  }

  private readLocalData(
    localHeaderOffset: number,
    compressionMethod: number,
    compressedSize: number,
    _uncompressedSize: number,
  ): Buffer {
    const buf = this.buffer;
    if (localHeaderOffset + 30 > buf.length) {
      throw new DocumentFormatError('Invalid local header offset in archive.');
    }

    const sig = buf.readUInt32LE(localHeaderOffset);
    if (sig !== 0x04034b50) {
      throw new DocumentFormatError('Invalid local header signature.');
    }

    const localNameLength = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buf.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;

    const compressedData = buf.subarray(dataOffset, dataOffset + compressedSize);

    if (compressionMethod === 0) {
      // Stored (no compression)
      return compressedData;
    } else if (compressionMethod === 8) {
      // Deflated
      try {
        const decompressed = zlib.inflateRawSync(compressedData, {
          maxOutputLength: EXTRACTION_LIMITS.maxDocxDecompressedBytes,
        });
        return decompressed;
      } catch (err: unknown) {
        throw new DocumentFormatError(
          `Failed to decompress entry: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      throw new DocumentFormatError(`Unsupported ZIP compression method ${compressionMethod}.`);
    }
  }
}
