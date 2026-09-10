// Keep track of the file backing the current data object
currentfile = ""

// Preparation to support other storage methods like webdav soon
currentmethod = "file"

// indicates if the user currently has the lock
lockedByMe = true

// For new files clone the default so editing a case never mutates the template.
case_data = JSON.parse(JSON.stringify(data_template))

manualSaveNoticeShown = false

function escapeStorageLabel(value) {
    return String(value).replace(/[&<>"']/g, function(character) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[character]
    })
}

function updateStorageIndicator() {
    if (typeof w2ui === 'undefined' || !w2ui.sidebar) return

    var fileLabel = currentfile ? escapeStorageLabel(currentfile) : 'Unsaved case'
    var autosaveLabel = window.auroraStorage.canAutosave()
        ? '&#128190; Local autosave enabled'
        : currentfile
            ? '&#128190; Manual save mode'
            : '&#128190; Save to enable autosave'
    var currentLockState = typeof lockstate === 'undefined'
        ? '&#128272; Case unlocked (edits allowed)'
        : lockstate

    w2ui.sidebar.bottomHTML = '<div id="lock" style="background-color: #eee; padding: 10px 5px; border-top: 1px solid silver">' +
        currentLockState + '<br>' + autosaveLabel + '<br><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + fileLabel + '">' + fileLabel + '</span></div>'
    w2ui.sidebar.refresh()
}


///////////////////////////
// GUI <> Data Functions //
///////////////////////////


/**
 * retrieves all changes from the various grids and transfers them into the global storage json
 */
function syncAllChanges(){
    w2ui.grd_timeline.save()
    case_data.timeline = w2ui.grd_timeline.records
    w2ui.grd_investigated_systems.save()
    case_data.investigated_systems = w2ui.grd_investigated_systems.records
    w2ui.grd_malware.save()
    case_data.malware = w2ui.grd_malware.records
    w2ui.grd_accounts.save()
    case_data.compromised_accounts = w2ui.grd_accounts.records
    w2ui.grd_network.save()
    case_data.network_indicators = w2ui.grd_network.records
    w2ui.grd_exfiltration.save()
    case_data.exfiltration = w2ui.grd_exfiltration.records
    w2ui.grd_osint.save()
    case_data.osint = w2ui.grd_osint.records
    w2ui.grd_systems.save()
    case_data.systems = w2ui.grd_systems.records
    w2ui.grd_actions.save()
    case_data.actions = w2ui.grd_actions.records
    w2ui.grd_casenotes.save()
    case_data.casenotes = w2ui.grd_casenotes.records
    w2ui.grd_investigators.save()
    case_data.investigators = w2ui.grd_investigators.records
    w2ui.grd_evidence.save()
    case_data.evidence = w2ui.grd_evidence.records

    // Data from the case Details popup is stored right to the storage object. So no need to update it here.
}


/**
 * inverse of syncAllChanges. Takes the data from the storage object and loads it into the grids, etc
 * This function invokes the correct storage method for the currenty opened project
 */

async function updateSOD(){
    switch(currentmethod){
        case "file":
            return updateSODFile()
        case "webdav":
            return updateSODWebdav()
    }
}



/**
 * Get current information from storage file and write to th ui objects.
 */
function renderCaseData() {
    w2ui.grd_timeline.records = case_data.timeline
    w2ui.grd_timeline.refresh()
    w2ui.grd_investigated_systems.records = case_data.investigated_systems
    w2ui.grd_investigated_systems.refresh()
    w2ui.grd_malware.records = case_data.malware
    w2ui.grd_malware.refresh()
    w2ui.grd_accounts.records = case_data.compromised_accounts
    w2ui.grd_accounts.refresh()
    w2ui.grd_network.records = case_data.network_indicators
    w2ui.grd_network.refresh()
    w2ui.grd_exfiltration.records = case_data.exfiltration
    w2ui.grd_exfiltration.refresh()
    w2ui.grd_osint.records = case_data.osint
    w2ui.grd_osint.refresh()
    w2ui.grd_systems.records = case_data.systems
    w2ui.grd_systems.refresh()
    w2ui.grd_actions.records = case_data.actions
    w2ui.grd_actions.refresh()
    w2ui.grd_evidence.records = case_data.evidence
    w2ui.grd_evidence.refresh()
    w2ui.grd_investigators.records = case_data.investigators
    w2ui.grd_investigators.refresh()
    w2ui.grd_casenotes.records = case_data.casenotes
    w2ui.grd_casenotes.refresh()

    if(lockedByMe) { // can only update editables when the fields are editable

        w2ui['grd_timeline'].getColumn('owner').editable.items = case_data.investigators
        w2ui.grd_timeline.getColumn('event_host').editable.items = case_data.systems
        w2ui.grd_timeline.getColumn('event_source_host').editable.items = case_data.systems
    }

    // Data from the case Details popup is taken right from the storage object.
}

function validateAndUpgradeCaseData() {
    if (case_data.storage_format_version > storage_format_version) {
        w2alert("You are opening a file created with a newer version of Aurora IR. Please upgrade Aurora IR and try again.")
        return false
    }

    if (!case_data.storage_format_version || case_data.storage_format_version < storage_format_version) {
        updateVersion(case_data.storage_format_version || 0)
    }

    return true
}

async function updateSODFile() {
    if (!currentfile) return true

    w2utils.lock($("#main"), "Loading file...", true)
    try {
        const contents = await window.auroraStorage.readCase(currentfile)
        case_data = JSON.parse(contents)

        if (!validateAndUpgradeCaseData()) return false
        renderCaseData()
        return true
    } catch (error) {
        console.error('Unable to update the current case file.', error)
        w2alert(`Unable to update the current case file: ${error.message || error}`)
        return false
    } finally {
        w2utils.unlock($("#main"))
    }
}


function updateSODWebdav() {
    alert("Not implemented yet.")
}


//////////////////
// SOD Handling //
//////////////////

/**
 * Clears all grids and creates a new case_data object from the template
 */
function newSOD() {
    w2confirm('Are you sure you want to create a new SOD? All unsaved data will be lost.', function btn(answer) {
        if (answer == "Yes") {
            case_data = JSON.parse(JSON.stringify(data_template))
            w2ui.grd_timeline.clear()
            w2ui.grd_timeline.render()
            w2ui.grd_investigated_systems.clear()
            w2ui.grd_investigated_systems.render()
            w2ui.grd_malware.clear()
            w2ui.grd_malware.render()
            w2ui.grd_accounts.clear()
            w2ui.grd_accounts.render()
            w2ui.grd_network.clear()
            w2ui.grd_network.render()
            w2ui.grd_exfiltration.clear()
            w2ui.grd_exfiltration.render()
            w2ui.grd_osint.clear()
            w2ui.grd_osint.render()
            w2ui.grd_systems.clear()
            w2ui.grd_systems.render()
            w2ui.grd_actions.clear()
            w2ui.grd_actions.render()
            w2ui.grd_casenotes.clear()
            w2ui.grd_casenotes.render()
            w2ui.grd_investigators.clear()
            w2ui.grd_investigators.render()
            w2ui.grd_evidence.clear()
            w2ui.grd_evidence.render()

            currentfile = "";
            window.auroraStorage.closeCase()
            deactivateReadOnly()
            stopAutoUpdate()
            startAutoSave()
            lockstate = "&#128272; Case unlocked (edits allowed)"
            $("#lock").html(lockstate)
            lockedByMe = true
            updateStorageIndicator()

            w2ui.main_layout.content('main', w2ui.grd_timeline);
        }
    });
}


/**
 * Method to invoke when there is reason to save back. Controlled by the
 * currentmethod variable it calls the correct concrete implementation
 */
async function saveSOD(options){
    options = options || {}
    //TODO: After implementing webdav: If the file has not been saved before (filepath is empty), ask if the user wants to save to filesystem or webdav
    switch(currentmethod){
        case "file":
            return saveSODFile(options)

        case "webdav":
            return saveSODWebdav()
    }
}


/**
 * Method to invoke when there is reason to open. Controlled by the
 * currentmethod variable it calls the correct concrete implementation
 */
async function openSOD(){
    switch(currentmethod){
        case "file":
            return openSODFile()

        case "webdav":
            return openSODWebdav()
    }
}



/////////////////////////////
///// VersionManagement /////
/////////////////////////////
/**
 * These are The updates that need to be made to an older sod file. This functionality was first introduced with
 * Storage file version 3. So 2->3 is the first fix here. Whenever we update the storage file format version we need
 * to supply patches here to lift the old file format to the new file format.
 */
function updateVersion(current_version){
    case_data.storage_format_version = storage_format_version

    // 2 -> 3
    if(current_version<3) {

        case_data.direction = [{id: 1, text: "<-"}, {id: 2, text: "->"}]
        casedata.killchain = [
            {id: 1, text: 'Recon'},
            {id: 2, text: 'Weaponization'},
            {id: 3, text: 'Delivery'},
            {id: 4, text: 'Exploitation'},
            {id: 5, text: 'Installation'},
            {id: 6, text: 'C2'},
            {id: 7, text: 'Actions on Obj.'},
        ]
    }

    // 3 -> 4
    if(current_version<4) {
        case_data.evidence = []
    }

    // 4 -> 5
    if(current_version<5) {

        case_data.system_types =[
            {id:1,text:"Desktop"},
            {id:2,text:"Server"},
            {id:3,text:"Phone"},
            {id:4,text:"Tablet"},
            {id:5,text:"TV"},
            {id:6,text:"Networking device"},
            {id:7,text:"IoT device"},
            {id:8,text:"Other"},
            {id:8,text:"Attacker Infra"}
        ]

        case_data.event_types.push({id:11, text:"C2"})
        current_version=5
    }

    // 5->6
    if(current_version<6) {
        case_data.osint = []
        current_version=6
    }

    case_data.storage_format_version = 6

    // 6->7
    case_data.storage_format_version = 7
}






////////////////////////
// Filesystem Storage //
////////////////////////

/**
 * Saves file to drive or share
 */
async function saveSODFile(options){
    options = options || {}
    var interactive = options.interactive !== false

    if(case_data.locked && !lockedByMe){
        if (interactive) w2alert("Cannot save. File locked by another analyst." );
        return false
    }

    syncAllChanges()
    case_data.storage_format_version=storage_format_version
    w2utils.lock($("#main"), "Saving file...", true)

    try {
        const result = await window.auroraStorage.saveCase(
            currentfile || null,
            JSON.stringify(case_data, null, "\t"),
            { interactive: interactive }
        )

        if (result.canceled) return false
        if (!result.saved) {
            console.warn('Local autosave was skipped because the browser no longer has write permission.')
            stopAutoSave()
            updateStorageIndicator()
            return false
        }

        currentfile = result.filePath

        if (result.persistent) {
            if (autosave_interval === null) startAutoSave()
        } else {
            stopAutoSave()
            if (interactive && !manualSaveNoticeShown) {
                manualSaveNoticeShown = true
                w2alert('This browser saved a downloaded copy. For in-place local autosaving, open Aurora on localhost in Chrome or Edge.')
            }
        }

        updateStorageIndicator()
        return true
    } catch (error) {
        console.error('Unable to save the case file.', error)
        w2alert(`Unable to save the case file: ${error.message || error}`)
        return false
    } finally {
        w2utils.unlock($("#main"))
    }
}

/**
 * Opens SOD file from Disk or Share
 */
function openSODFile() {
    w2confirm('Are you sure you want to open a SOD? All unsaved data in the current one will be lost.', async function btn(answer) {
        if (answer == "Yes") {
            var selectedCase = null
            var previousCaseData = case_data
            var caseAccepted = false
            try {
                selectedCase = await window.auroraStorage.openCase()
                if (selectedCase.canceled) return

                const openedCaseData = JSON.parse(selectedCase.contents)
                case_data = openedCaseData

                if (!validateAndUpgradeCaseData()) {
                    case_data = previousCaseData
                    window.auroraStorage.discardOpenedCase(selectedCase.selectionId)
                    return
                }
                renderCaseData()
                window.auroraStorage.acceptOpenedCase(selectedCase.selectionId)
                currentfile = selectedCase.filePath
                caseAccepted = true

                w2ui.main_layout.content('main', w2ui.grd_timeline)
                w2ui.sidebar.select('timeline')

                if (!selectedCase.persistent) {
                    case_data.locked = false
                    lockedByMe = true
                    deactivateReadOnly()
                    stopAutoSave()
                    stopAutoUpdate()
                    lockstate = "&#128272; Case unlocked (edits allowed)"
                    updateStorageIndicator()
                    w2alert('The case is open in manual save mode. For in-place local autosaving, use Chrome or Edge and access Aurora through localhost or HTTPS.')
                } else if (case_data.locked) {
                    w2alert("The SOD is locked by another analyst. Opening in Readonly mode.")
                    lockedByMe = false
                    activateReadOnly()
                    stopAutoSave()
                    startAutoUpdate()
                } else {
                    await requestLock(true)
                }

                w2ui.main_layout.content('main', w2ui.grd_timeline)
            } catch (error) {
                if (!caseAccepted) window.auroraStorage.discardOpenedCase(selectedCase?.selectionId)
                if (!caseAccepted && case_data !== previousCaseData) {
                    case_data = previousCaseData
                    renderCaseData()
                }
                console.error('Unable to open the case file.', error)
                w2alert(`Unable to open the case file: ${error.message || error}`)
            }
        }
    })
}



////////////////////
// Webdav Storage //
////////////////////

/**
 * Saves file to webdav
 */
function saveSODWebdav() {
    alert("Not implemented yet.")
    return true
}

/**
 * Opens file from webdav
 */
function openSODWebdav() {
    alert("Not implemented yet.")
}


/////////////////////
// Lock Management //
/////////////////////

/**
 * The user wants to lock the file so editing is possible
 */
async function lockSOD(){ // check if it is still needed - switched everything over to requestlock()

    case_data.locked=true
    lockedByMe = true
    deactivateReadOnly()
    await saveSOD()

}

/**
 * The user releases the file so anyone else can successfully obtain the lock
 */
async function releaseLock(){
    case_data.locked = false
    if (!await saveSOD()) return
    lockedByMe = false
    activateReadOnly()
    stopAutoSave()
    startAutoUpdate()
}

/**
 * Try to obtain the lock to make the data editable
 * @param sodiscurrent - if this method is called right after a sod was loaded there is no need to load it again to check the lock state.
 */
async function requestLock() {
    if (await updateSOD() == false) {
        activateReadOnly()
        w2alert("You are opening a file created with a newer version of Aurora IR. Please upgrade to the newest version of Aurora IR and try again")
        return
    }

    if(case_data.locked) {
        w2alert("The SOD is still locked by another analyst.")
        return
    }

    stopAutoUpdate()
    startAutoSave()
    deactivateReadOnly()

    lockstate = "&#128272; Case unlocked (edits allowed)"

    $( "#lock" ).html(lockstate)
    lockedByMe = true
    case_data.locked=true

    await saveSOD()
}

/**
 * Forces the lock. Data could become inconsistent
 */
function forceUnLock() {
    w2confirm('You are about to force-aqcuire the lock on the file. If anyone else still has the file opened it might lead to data loss.', async function btn(answer) {
        if (answer == "No") {
            return
        }
        else {
            if (await updateSOD() == false) {
                activateReadOnly()
                w2alert("You are opening a file created with a newer version of Aurora IR. Please upgrade to the newest version of Aurora IR and try again.")
                return
            }

            stopAutoUpdate()
            startAutoSave()
            deactivateReadOnly()
            lockstate = "&#128272; Case unlocked (edits allowed)"
            $( "#lock" ).html(lockstate)
            lockedByMe = true
            case_data.locked=true

            // Deal with save button
            w2ui['toolbar'].enable('file:save_sod');

            // Deal with locks
            w2ui['toolbar'].enable('file:release_lock');
            w2ui['toolbar'].disable('file:request_lock');
            w2ui['toolbar'].disable('file:force_unlock');
            await saveSOD()
        }
    })
}




//////////////////////
// Helper Functions //
//////////////////////


/**
 * Returns the next useable recid for a grid. A bit clunky this workaround but needed for w2ui
 * @param grid - W2ui Grid object
 */
function getNextRECID(grid){

    // make sure all the gui entries are already in the records array. That makes the red flags in the grid boxes go away as an additional result
    grid.save()

    if(grid.records.length < 1) {
        return 1
    }

    var highest = 1;

    for(var i=0; i< grid.records.length;i++){

        var recid = grid.records[i].recid
        if(recid>highest) highest=recid

    }
    // return an id one higher then the existing highest
    return highest+1
}



/////////////////////////
///// Timer Control /////
/////////////////////////

autosave_interval = null   // for write mode
autoupdate_interval = null // for readonly mode


/**
 * Autosave mode is activated when the user has the write lock. The Current state will be saved to the storage file every 5 minutes.
 */
function startAutoSave(){
    stopAutoSave()
    if (!currentfile || !window.auroraStorage.canAutosave()) return
    autosave_interval = setInterval(function() {
        void saveSOD({ interactive: false })
    }, 5 * 60 * 1000); // autosave every 5 minutes
}

function stopAutoSave(){

    clearInterval(autosave_interval);
    autosave_interval = null
}

/**
 * AutoUpdate mode is activated when the user is in read-only mode. The current state will be read from the storage file every minute and pushed into the gui.
 */
function startAutoUpdate(){
    stopAutoUpdate()
    autoupdate_interval = setInterval(updateSOD, 60 * 1000); // autoupdate every minute
}

function stopAutoUpdate(){

    clearInterval(autoupdate_interval)
    autoupdate_interval = null
}



/////////////////////////////
///// Systems Management ////
/////////////////////////////

function updateSystems(event){
    old_system = event.value_original
    new_system = event.value_new

    if(old_system=="" || old_system==null) return; // don't override all fields with new values when the old value was an empty field

    //check timeline
    records = w2ui.grd_timeline.records
    for(var i=0;i<records.length;i++){
        system1 = records[i].event_host
        system2 = records[i].event_source_host

        if(system1 == old_system ) records[i].event_host=new_system
        if(system2 == old_system) records[i].event_source_host=new_system
    }

    //check investigated systems
    records = w2ui.grd_investigated_systems.records
    for(var i=0;i<records.length;i++){
        system1 = records[i].hostname

        if(system1 == old_system) records[i].hostname=new_system

    }

    //check malware
    records = w2ui.grd_malware.records
    for(var i=0;i<records.length;i++){
        system1 = records[i].hostname

        if(system1 == old_system) records[i].hostname=new_system

    }

    //Check exfil
    records = w2ui.grd_exfiltration.records
    for(var i=0;i<records.length;i++){
        system1 = records[i].stagingsystem
        system2 = records[i].original
        system3 = records[i].exfil_to

        if(system1 == old_system) records[i].stagingsystem=new_system
        if(system2 == old_system) records[i].original=new_system
        if(system3 == old_system) records[i].exfil_to=new_system

    }
}

// Browsers cannot reliably wait for asynchronous file writes while a tab is
// closing. renderer.mjs therefore performs a best-effort save when the page is
// hidden, and the explicit Release Lock action remains the reliable unlock path.
