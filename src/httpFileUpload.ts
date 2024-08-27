import { Request } from 'express'
import * as multer from 'multer'
import { FileFilterCallback } from 'multer'
import { Config, getSpecificationImageOrDocumentUrl } from './config'
import { join } from 'path'
import * as fs from 'fs'
import { SpecificationFileUsage } from '@modbus2mqtt/specification.shared'

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

export interface GetRequestWithUploadParameter extends Request {
  query: {
    specification?: string
    busid?: string
    usage?: SpecificationFileUsage
    slaveid?: string
    url?: string
  }
}
export function getFilenameForUpload(filename: string) {
  return filename && filename.length > 0 ? filename : '_new'
}
export const fileStorage = multer.diskStorage({
  destination: (request: GetRequestWithUploadParameter, _file: Express.Multer.File, callback: DestinationCallback): void => {
    let localdir = Config.getConfiguration().filelocation
    if (request.query.specification !== null) {
      let dir = getSpecificationImageOrDocumentUrl(
        join(Config.getConfiguration().filelocation, 'local'),
        getFilenameForUpload(request.query.specification!),
        ''
      )
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      callback(null, dir)
    } else callback(new Error('No parameter specification found'), localdir)
  },
  filename: (_req: Request, file: Express.Multer.File, callback: FileNameCallback): void => {
    callback(null, file.originalname)
  },
})

export const fileFilter = (_request: Request, file: Express.Multer.File, callback: FileFilterCallback): void => {
  if (
    file.mimetype === 'application/pdf' ||
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/jpg' ||
    file.mimetype === 'image/jpeg'
  ) {
    callback(null, true)
  } else {
    callback(null, false)
  }
}
