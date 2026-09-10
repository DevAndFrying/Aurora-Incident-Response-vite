import assert from 'node:assert/strict'
import test from 'node:test'

import { createBrowserStorage } from './browser-storage.mjs'

function createFileHandle(name, initialContents = '', permission = 'granted') {
    let contents = initialContents

    return {
        name,
        async queryPermission() {
            return permission
        },
        async requestPermission() {
            permission = 'granted'
            return permission
        },
        async getFile() {
            return {
                name,
                async text() {
                    return contents
                }
            }
        },
        async createWritable() {
            return {
                async write(value) {
                    contents = value
                },
                async close() {}
            }
        },
        contents() {
            return contents
        }
    }
}

function createDocument() {
    const clicks = []
    return {
        clicks,
        body: {
            append() {}
        },
        createElement(tagName) {
            return {
                tagName,
                addEventListener() {},
                click() {
                    clicks.push(this)
                },
                remove() {}
            }
        }
    }
}

test('opens a local case and autosaves back to the selected handle', async () => {
    const handle = createFileHandle('case.fox', '{"case_id":"IR-1"}')
    const browserWindow = {
        location: { href: 'http://127.0.0.1:5173/' },
        showOpenFilePicker: async () => [handle],
        showSaveFilePicker: async () => {
            throw new Error('The save picker should not be needed for an open writable file.')
        }
    }
    const storage = createBrowserStorage({ browserWindow, browserDocument: createDocument() })

    const opened = await storage.openCase()
    assert.deepEqual(opened, {
        canceled: false,
        selectionId: 1,
        filePath: 'case.fox',
        contents: '{"case_id":"IR-1"}',
        writable: true,
        persistent: true
    })
    assert.equal(storage.canAutosave(), false)
    storage.acceptOpenedCase(opened.selectionId)
    assert.equal(storage.canAutosave(), true)

    const saved = await storage.saveCase('case.fox', '{"case_id":"IR-2"}', { interactive: false })
    assert.equal(saved.saved, true)
    assert.equal(saved.persistent, true)
    assert.equal(handle.contents(), '{"case_id":"IR-2"}')
})

test('asks for a local file on the first interactive save', async () => {
    const handle = createFileHandle('new-case.fox')
    const browserWindow = {
        location: { href: 'http://127.0.0.1:5173/' },
        showOpenFilePicker: async () => [],
        showSaveFilePicker: async () => handle
    }
    const storage = createBrowserStorage({ browserWindow, browserDocument: createDocument() })

    const result = await storage.saveCase(null, '{"locked":false}')
    assert.equal(result.filePath, 'new-case.fox')
    assert.equal(result.persistent, true)
    assert.equal(storage.canAutosave(), true)
    assert.equal(handle.contents(), '{"locked":false}')
})

test('skips background autosave when no writable handle exists', async () => {
    const browserWindow = {
        location: { href: 'http://127.0.0.1:5173/' }
    }
    const storage = createBrowserStorage({ browserWindow, browserDocument: createDocument() })

    const result = await storage.saveCase('case.fox', '{}', { interactive: false })
    assert.equal(result.saved, false)
    assert.equal(result.persistent, false)
    assert.equal(storage.canAutosave(), false)
})

test('does not replace the autosave target until a selected case is accepted', async () => {
    const originalHandle = createFileHandle('original.fox')
    const candidateHandle = createFileHandle('candidate.fox', 'not valid JSON')
    const browserWindow = {
        location: { href: 'http://127.0.0.1:5173/' },
        showOpenFilePicker: async () => [candidateHandle],
        showSaveFilePicker: async () => originalHandle
    }
    const storage = createBrowserStorage({ browserWindow, browserDocument: createDocument() })

    await storage.saveCase(null, '{"case_id":"original"}')
    const candidate = await storage.openCase()
    storage.discardOpenedCase(candidate.selectionId)
    await storage.saveCase('original.fox', '{"case_id":"still-original"}', { interactive: false })

    assert.equal(originalHandle.contents(), '{"case_id":"still-original"}')
    assert.equal(candidateHandle.contents(), 'not valid JSON')
})

test('only opens HTTP and HTTPS links', async () => {
    const browserDocument = createDocument()
    const storage = createBrowserStorage({
        browserWindow: { location: { href: 'http://127.0.0.1:5173/' } },
        browserDocument
    })

    await storage.openExternal('https://example.com/help')
    assert.equal(browserDocument.clicks[0].href, 'https://example.com/help')
    await assert.rejects(storage.openExternal('file:///etc/passwd'), /Only HTTP and HTTPS/)
})
