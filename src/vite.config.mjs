import { cpSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const rendererStaticDirectories = ['css', 'fonts', 'img', 'src/webfonts']

function copyRendererStaticFiles() {
    return {
        name: 'copy-aurora-renderer-static-files',
        closeBundle() {
            for (const directory of rendererStaticDirectories) {
                const destination = resolve('dist', directory)
                mkdirSync(destination, { recursive: true })
                cpSync(resolve(directory), destination, { recursive: true })
            }
        }
    }
}

export default defineConfig({
    base: './',
    plugins: [copyRendererStaticFiles()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2022',
        assetsInlineLimit: 0
    },
    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true
    }
})
