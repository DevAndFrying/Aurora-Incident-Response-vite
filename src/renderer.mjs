import { createBrowserStorage } from './browser-storage.mjs'
import visScript from './js/vis.js?url'
import jqueryScript from './js/jquery.min.js?url'
import w2uiScript from './js/w2ui-1.5.rc1.min.js?url'
import chartScript from './js/chart.js?url'
import dataTemplateScript from './data_template.js?url'
import mispScript from './misp.js?url'
import webdavScript from './js/webdav_lib.js?url'
import virusTotalScript from './virustotal.js?url'
import controllerScript from './controller.js?url'
import dataScript from './data.js?url'
import guiDefinitionsScript from './gui_definitions.js?url'
import guiFunctionsScript from './gui_functions.js?url'
import settingsScript from './settings.js?url'
import importScript from './import.js?url'
import exportScript from './export.js?url'
import helperFunctionsScript from './helper_functions.js?url'
import caseDetailsForm from './templates/case_details_form.html?raw'

window.auroraStorage = createBrowserStorage()

const stylesheets = [
    './css/all.min.css',
    './css/vis.css',
    './css/w2ui-1.5.rc1.min.css',
    './css/aurora.css'
]

const legacyScripts = [
    visScript,
    jqueryScript,
    w2uiScript,
    chartScript,
    dataTemplateScript,
    mispScript,
    webdavScript,
    virusTotalScript,
    controllerScript,
    dataScript,
    guiDefinitionsScript,
    guiFunctionsScript,
    settingsScript,
    importScript,
    exportScript,
    helperFunctionsScript
]

function loadStylesheet(relativePath) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL(relativePath, window.location.href).href
    document.head.append(link)
}

function loadClassicScript(source) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = source
        script.onload = resolve
        script.onerror = () => reject(new Error(`Unable to load renderer script: ${source}`))
        document.head.append(script)
    })
}

function initializeApplication() {
    $('#main').w2layout(config.main_layout)
    w2ui.main_layout.content('top', $().w2toolbar(config.toolbar))
    w2ui.main_layout.content('left', $().w2sidebar(config.sidebar))
    w2ui.main_layout.content('main', $().w2grid(config.grd_timeline))

    $().w2grid(config.grd_investigated_systems)
    $().w2grid(config.grd_investigators)
    $().w2grid(config.grd_evidence)
    $().w2grid(config.grd_malware)
    $().w2grid(config.grd_accounts)
    $().w2grid(config.grd_network)
    $().w2grid(config.grd_exfiltration)
    $().w2grid(config.grd_osint)
    $().w2grid(config.grd_systems)
    $().w2grid(config.grd_actions)
    $().w2grid(config.grd_casenotes)
    $().w2grid(config.grd_add_misp)
    $().w2grid(config.grd_import_mapping)
    $().w2layout(config.popup_layout)
    $().w2layout(config.webdav_popup_layout)
    $().w2form(config.case_form)
    $().w2form(config.webdav_form)

    deactivateReadOnly()
    registerComponents()
    startAutoSave()
    updateStorageIndicator()
    w2ui.toolbar.disable('file:open_webdav')
}

async function bootstrap() {
    stylesheets.forEach(loadStylesheet)

    for (const script of legacyScripts) {
        await loadClassicScript(script)
    }

    config.case_form.formHTML = caseDetailsForm
    delete config.case_form.formURL

    initializeApplication()

    const flushLocalCase = () => {
        if (window.auroraStorage.canAutosave() && typeof window.saveSOD === 'function') {
            void window.saveSOD({ interactive: false })
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushLocalCase()
    })
    window.addEventListener('pagehide', flushLocalCase)
    window.addEventListener('beforeunload', (event) => {
        flushLocalCase()
        if (window.currentfile && window.case_data?.locked && window.lockedByMe) {
            event.preventDefault()
            event.returnValue = true
        }
    })
}

bootstrap().catch((error) => {
    console.error(error)
    const errorView = document.createElement('main')
    const heading = document.createElement('h1')
    const message = document.createElement('p')
    errorView.className = 'startup-error'
    heading.textContent = 'Aurora could not start'
    message.textContent = String(error.message || error)
    errorView.append(heading, message)
    document.querySelector('#main').replaceChildren(errorView)
})
