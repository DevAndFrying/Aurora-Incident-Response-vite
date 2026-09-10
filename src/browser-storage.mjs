const CASE_FILE_TYPES = [
    {
        description: 'Aurora case files',
        accept: { 'application/json': ['.fox'] }
    }
]

const CSV_FILE_TYPES = [
    {
        description: 'CSV files',
        accept: { 'text/csv': ['.csv'] }
    }
]

function isAbortError(error) {
    return error?.name === 'AbortError'
}

function assertText(value, label) {
    if (typeof value !== 'string') {
        throw new TypeError(`${label} must be a string.`)
    }
}

function normalizedFileName(value, fallback) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return fallback
    }

    return value.replace(/[\\/:*?"<>|]/g, '-').trim()
}

function chooseFileWithInput(browserDocument, accept) {
    return new Promise((resolve) => {
        const input = browserDocument.createElement('input')
        input.type = 'file'
        input.accept = accept
        input.hidden = true

        let settled = false
        const finish = (file) => {
            if (settled) return
            settled = true
            input.remove()
            resolve(file || null)
        }

        input.addEventListener('change', () => finish(input.files?.[0]), { once: true })
        input.addEventListener('cancel', () => finish(null), { once: true })
        browserDocument.body.append(input)
        input.click()
    })
}

function downloadText(browserWindow, browserDocument, contents, fileName, mimeType) {
    const objectUrl = browserWindow.URL.createObjectURL(new Blob([contents], { type: mimeType }))
    const link = browserDocument.createElement('a')
    link.href = objectUrl
    link.download = fileName
    link.hidden = true
    browserDocument.body.append(link)
    link.click()
    link.remove()
    browserWindow.setTimeout(() => browserWindow.URL.revokeObjectURL(objectUrl), 0)
}

async function hasPermission(handle, mode, allowPrompt) {
    if (typeof handle.queryPermission !== 'function') return true

    const options = { mode }
    if (await handle.queryPermission(options) === 'granted') return true
    if (!allowPrompt || typeof handle.requestPermission !== 'function') return false
    return await handle.requestPermission(options) === 'granted'
}

async function writeFileHandle(handle, contents) {
    const writable = await handle.createWritable()
    try {
        await writable.write(contents)
    } finally {
        await writable.close()
    }
}

export function createBrowserStorage({ browserWindow = window, browserDocument = document } = {}) {
    let currentCaseHandle = null
    let currentCaseName = ''
    let currentCaseContents = ''
    let currentCaseWritable = false
    let caseWriteQueue = Promise.resolve()
    let pendingCase = null
    let nextSelectionId = 1

    const supportsOpenPicker = typeof browserWindow.showOpenFilePicker === 'function'
    const supportsSavePicker = typeof browserWindow.showSaveFilePicker === 'function'

    async function selectSaveHandle(suggestedName) {
        if (!supportsSavePicker) return null

        return browserWindow.showSaveFilePicker({
            suggestedName: normalizedFileName(suggestedName, 'incident.fox'),
            types: CASE_FILE_TYPES
        })
    }

    return {
        get capabilities() {
            return {
                localFileAutosave: supportsOpenPicker && supportsSavePicker
            }
        },

        canAutosave() {
            return Boolean(currentCaseHandle && currentCaseWritable)
        },

        currentFileName() {
            return currentCaseName
        },

        closeCase() {
            currentCaseHandle = null
            currentCaseName = ''
            currentCaseContents = ''
            currentCaseWritable = false
            pendingCase = null
        },

        acceptOpenedCase(selectionId) {
            if (!pendingCase || pendingCase.selectionId !== selectionId) {
                throw new Error('The selected case file is no longer available.')
            }

            currentCaseHandle = pendingCase.handle
            currentCaseName = pendingCase.fileName
            currentCaseContents = pendingCase.contents
            currentCaseWritable = pendingCase.writable
            pendingCase = null
        },

        discardOpenedCase(selectionId) {
            if (!selectionId || pendingCase?.selectionId === selectionId) {
                pendingCase = null
            }
        },

        async openCase() {
            try {
                pendingCase = null
                if (supportsOpenPicker) {
                    const handles = await browserWindow.showOpenFilePicker({
                        multiple: false,
                        types: CASE_FILE_TYPES
                    })
                    const handle = handles[0]
                    if (!handle) return { canceled: true }

                    const writable = await hasPermission(handle, 'readwrite', true)
                    const file = await handle.getFile()
                    const contents = await file.text()

                    const fileName = file.name || handle.name
                    const selectionId = nextSelectionId++
                    pendingCase = { selectionId, handle, fileName, contents, writable }

                    return {
                        canceled: false,
                        selectionId,
                        filePath: fileName,
                        contents,
                        writable,
                        persistent: writable
                    }
                }

                const file = await chooseFileWithInput(browserDocument, '.fox,application/json')
                if (!file) return { canceled: true }

                const contents = await file.text()
                const selectionId = nextSelectionId++
                pendingCase = {
                    selectionId,
                    handle: null,
                    fileName: file.name,
                    contents,
                    writable: false
                }

                return {
                    canceled: false,
                    selectionId,
                    filePath: file.name,
                    contents,
                    writable: true,
                    persistent: false
                }
            } catch (error) {
                if (isAbortError(error)) return { canceled: true }
                throw error
            }
        },

        async readCase(fileName) {
            if (fileName && currentCaseName && fileName !== currentCaseName) {
                throw new Error('The requested case is not the currently selected local file.')
            }

            if (!currentCaseHandle) return currentCaseContents

            await caseWriteQueue
            const file = await currentCaseHandle.getFile()
            currentCaseContents = await file.text()
            return currentCaseContents
        },

        async saveCase(fileName, contents, { interactive = true } = {}) {
            assertText(contents, 'Case contents')

            try {
                let handle = currentCaseHandle
                let writable = handle
                    ? await hasPermission(handle, 'readwrite', interactive)
                    : false

                if (handle && !writable) currentCaseWritable = false

                if ((!handle || !writable) && interactive) {
                    handle = await selectSaveHandle(fileName || currentCaseName || 'incident.fox')
                    writable = Boolean(handle) && await hasPermission(handle, 'readwrite', true)
                }

                if (handle && writable) {
                    const pendingWrite = caseWriteQueue.then(() => writeFileHandle(handle, contents))
                    caseWriteQueue = pendingWrite.catch(() => {})
                    await pendingWrite
                    currentCaseHandle = handle
                    currentCaseName = handle.name
                    currentCaseContents = contents
                    currentCaseWritable = true

                    return {
                        canceled: false,
                        saved: true,
                        persistent: true,
                        filePath: currentCaseName
                    }
                }

                if (!interactive) {
                    return {
                        canceled: false,
                        saved: false,
                        persistent: false,
                        filePath: currentCaseName || fileName || ''
                    }
                }

                const downloadName = normalizedFileName(
                    fileName || currentCaseName || 'incident.fox',
                    'incident.fox'
                )
                downloadText(browserWindow, browserDocument, contents, downloadName, 'application/json')
                currentCaseHandle = null
                currentCaseName = downloadName
                currentCaseContents = contents
                currentCaseWritable = false

                return {
                    canceled: false,
                    saved: true,
                    persistent: false,
                    filePath: downloadName
                }
            } catch (error) {
                if (isAbortError(error)) return { canceled: true }
                throw error
            }
        },

        async openCsv() {
            try {
                if (supportsOpenPicker) {
                    const handles = await browserWindow.showOpenFilePicker({
                        multiple: false,
                        types: CSV_FILE_TYPES
                    })
                    const handle = handles[0]
                    if (!handle) return { canceled: true }
                    const file = await handle.getFile()
                    return { canceled: false, contents: await file.text() }
                }

                const file = await chooseFileWithInput(browserDocument, '.csv,text/csv')
                return file
                    ? { canceled: false, contents: await file.text() }
                    : { canceled: true }
            } catch (error) {
                if (isAbortError(error)) return { canceled: true }
                throw error
            }
        },

        async saveCsv(contents) {
            assertText(contents, 'CSV contents')

            try {
                if (supportsSavePicker) {
                    const handle = await browserWindow.showSaveFilePicker({
                        suggestedName: 'aurora-export.csv',
                        types: CSV_FILE_TYPES
                    })
                    await writeFileHandle(handle, contents)
                    return { canceled: false, filePath: handle.name }
                }

                downloadText(
                    browserWindow,
                    browserDocument,
                    contents,
                    'aurora-export.csv',
                    'text/csv;charset=utf-8'
                )
                return { canceled: false, filePath: 'aurora-export.csv' }
            } catch (error) {
                if (isAbortError(error)) return { canceled: true }
                throw error
            }
        },

        openExternal(candidate) {
            const url = new URL(candidate, browserWindow.location.href)
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                return Promise.reject(new Error('Only HTTP and HTTPS links may be opened.'))
            }

            const link = browserDocument.createElement('a')
            link.href = url.href
            link.target = '_blank'
            link.rel = 'noopener noreferrer'
            link.click()
            return Promise.resolve()
        }
    }
}
