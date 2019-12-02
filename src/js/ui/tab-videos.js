const core = require('../core');
const ExportHelper = require('../casc/export-helper');

core.events.once('init', () => {
	// Track when the user clicks to export selected sound files.
	core.events.on('click-export-video', async () => {
		const userSelection = core.view.selectionVideos;
		if (userSelection.length === 0) {
			core.setToast('info', 'You didn\'t select any files to export; you should do that first.');
			return;
		}

		const helper = new ExportHelper(userSelection.length, 'videos');
		helper.start();
		
		for (const fileName of userSelection) {
			try {
				const data = await core.view.casc.getFileByName(fileName);
				await data.writeToFile(ExportHelper.getExportPath(fileName));
				helper.mark(fileName, true);
			} catch (e) {
				helper.mark(fileName, false, e.message);
			}
		}

		helper.finish();
	});
});