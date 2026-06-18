import { join } from 'path'
import { configuration } from '@/configuration'

export const HAPI_BLOBS_DIR_NAME = 'blobs'

export function getHapiBlobsDir(): string {
    return join(configuration.happyHomeDir, HAPI_BLOBS_DIR_NAME)
}
