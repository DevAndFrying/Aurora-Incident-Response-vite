async function export_csv(grid){
    csv =""
    //generate header line
    headerline = ""
    for(var i=0; i<grid.columns.length;i++) {
        headerline += grid.columns[i].caption
        if(i<grid.columns.length-1) headerline += ","
    }

    csv += headerline + "\n"

    //generate content
    for(var i = 0;i < grid.records.length;i++){

       line = ""
       for(var j=0; j<grid.columns.length;j++) {
           data = grid.records[i][grid.columns[j].field]
           if(!data) data = " "
           line += data
           if(j<grid.columns.length-1) line += ","
       }
       csv += line +"\n"
    }

    w2utils.lock($("#main"), "Exporting file...", true)
    try {
        const result = await window.auroraStorage.saveCsv(csv)
        return !result.canceled
    } catch (error) {
        console.error('Unable to export the CSV file.', error)
        w2alert(`Unable to export the CSV file: ${error.message || error}`)
        return false
    } finally {
        w2utils.unlock($("#main"))
    }
}
