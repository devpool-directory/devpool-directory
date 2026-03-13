// This file contains the synchronization logic for directory data.

import { syncDirectoryData } from '../artifacts/storage';
import { fetchDirectoryInfo } from '../directory/get-social-m';

export async function syncDirectory() {
  try {
    const directoryData = await fetchDirectoryInfo();
    await syncDirectoryData(directoryData);
    console.log('Directory data synchronized successfully.');
  } catch (error) {
    console.error('Error during directory sync:', error);
    throw new Error('Directory synchronization failed');
  }
}
