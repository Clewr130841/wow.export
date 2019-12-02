const core = require('../core');
const log = require('../log');
const path = require('path');
const util = require('util');
const ExportHelper = require('../casc/export-helper');

let isLoading = null;

let selectedFile = null;
let isTrackLoaded = false;

let audioNode = null;
let data = null;

/**
 * Update the current status of the sound player seek bar.
 */
const updateSeek = () => {
	if (!core.view.soundPlayerState || !audioNode)
		return;

	core.view.soundPlayerSeek = audioNode.currentTime / audioNode.duration;

	if (core.view.soundPlayerSeek === 1) {
		if (core.view.config.soundPlayerLoop)
			audioNode.play();
		else
			core.view.soundPlayerState = false;
	}

	requestAnimationFrame(updateSeek);
};

/**
 * Play the currently loaded track.
 * Selected track will be loaded if it's not already.
 */
const playSelectedTrack = async () => {
	if (!isTrackLoaded)
		await loadSelectedTrack();

	// Ensure the track actually loaded.
	if (isTrackLoaded) {
		core.view.soundPlayerState = true;
		audioNode.play();
		updateSeek();
	}
};

/**
 * Pause the currently playing track.
 */
const pauseSelectedTrack = () => {
	core.view.soundPlayerState = false;
	audioNode.pause();
};

/**
 * Unload the currently selected track.
 * Playback will be halted.
 */
const unloadSelectedTrack = () => {
	isTrackLoaded = false;
	core.view.soundPlayerState = false;
	core.view.soundPlayerDuration = 0;
	core.view.soundPlayerSeek = 0;
	audioNode.src = '';

	// Free assigned data URL.
	if (data)
		data.revokeDataURL();
};

/**
 * Load the currently selected track.
 * Does not automatically begin playback.
 * Ensure unloadSelectedTrack() is called first.
 */
const loadSelectedTrack = async () => {
	isLoading = true;
	const toast = core.delayToast(200, 'progress', util.format('Loading %s, please wait...', selectedFile), null, -1, false);
	log.write('Previewing sound file %s', selectedFile);

	try {
		data = await core.view.casc.getFileByName(selectedFile);
		audioNode.src = data.getDataURL();

		isTrackLoaded = true;

		toast.cancel();
	} catch (e) {
		toast.cancel();
		core.setToast('error', 'Unable to open file: ' + selectedFile, { 'View Log': () => log.openRuntimeLog() });
		log.write('Failed to open CASC file: %s', e.message);
	}

	isLoading = false;
};

core.events.once('init', () => {
	// Create internal audio node.
	audioNode = document.createElement('audio');
	audioNode.volume = core.view.config.soundPlayerVolume;
	audioNode.ondurationchange = () => core.view.soundPlayerDuration = audioNode.duration;

	// Track changes to config.soundPlayerVolume and adjust our gain node.
	core.view.$watch('config.soundPlayerVolume', value => {
		audioNode.volume = value;
	});

	// Track requests to seek the current sound file and directly edit the
	// time of the audio node. core.view.soundPlayerSeek will automatically update.
	core.events.on('click-sound-seek', seek => {
		if (audioNode && isTrackLoaded)
			audioNode.currentTime = audioNode.duration * seek;
	});

	// Track sound-player-toggle events.
	core.events.on('click-sound-toggle', () => {
		if (core.view.soundPlayerState)
			pauseSelectedTrack();
		else
			playSelectedTrack();
	});

	// Track selection changes on the sound listbox and set first as active entry.
	core.view.$watch('selectionSounds', async selection => {
		// Check if the first file in the selection is "new".
		const first = selection[0];
		if (!isLoading && first && selectedFile !== first) {
			core.view.soundPlayerTitle = path.basename(first);

			selectedFile = first;
			unloadSelectedTrack();

			if (core.view.config.soundPlayerAutoPlay)
				playSelectedTrack();
		}
	});

	// Track when the user clicks to export selected sound files.
	core.events.on('click-export-sound', async () => {
		const userSelection = core.view.selectionSounds;
		if (userSelection.length === 0) {
			core.setToast('info', 'You didn\'t select any files to export; you should do that first.');
			return;
		}

		const helper = new ExportHelper(userSelection.length, 'sound files');
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

	// If the application crashes, we need to make sure to stop playing sound.
	core.events.on('crash', () => {
		if (audioNode)
			audioNode.remove();

		unloadSelectedTrack();
	});
});