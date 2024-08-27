import { Mutex } from 'async-mutex'
export const yamlDir = '__tests__/yaml-dir'
export let singleMutex = new Mutex()
