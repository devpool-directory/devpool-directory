// This file contains the unit tests for the directory synchronization logic.

import { syncDirectory } from './directory-sync';
import { syncDirectoryData } from '../artifacts/storage';
import { fetchDirectoryInfo } from '../directory/get-social-m';

jest.mock('../artifacts/storage');
jest.mock('../directory/get-social-m');

describe('syncDirectory', () => {
  it('should sync directory data successfully', async () => {
    fetchDirectoryInfo.mockResolvedValue({ id: 1, name: 'Sample Directory' });
    syncDirectoryData.mockResolvedValue(true);

    await expect(syncDirectory()).resolves.not.toThrow();
  });

  it('should throw an error if sync fails', async () => {
    fetchDirectoryInfo.mockResolvedValue({ id: 1, name: 'Sample Directory' });
    syncDirectoryData.mockRejectedValue(new Error('Sync failed'));

    await expect(syncDirectory()).rejects.toThrow('Directory synchronization failed');
  });
});
