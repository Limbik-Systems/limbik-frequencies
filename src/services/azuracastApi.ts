import { STATION_CONFIG } from '../constants/station';
import {
  NowPlayingResponse,
  RequestCatalogResponse,
  RequestableSongItem,
} from '../types/radio';

/**
 * Fetches current Now Playing, Playing Next, Listener Count, and Song History
 * from the Limbik Frequencies AzuraCast API.
 */
export async function fetchNowPlaying(): Promise<NowPlayingResponse> {
  const response = await fetch(STATION_CONFIG.nowPlayingApiUrl);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching Now Playing metadata`);
  }

  const data: NowPlayingResponse = await response.json();
  return data;
}

/**
 * Searches the 3,400+ requestable tracks on Limbik Frequencies.
 */
export async function fetchRequestableSongs(
  searchPhrase = '',
  page = 1,
  rowCount = 25
): Promise<RequestCatalogResponse> {
  const params = new URLSearchParams({
    rowCount: String(rowCount),
    current: String(page),
    searchPhrase: searchPhrase.trim(),
  });

  const url = `${STATION_CONFIG.requestsApiUrl}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading song catalog`);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return {
      rows: data as RequestableSongItem[],
      current: 1,
      rowCount: data.length,
      total: data.length,
    };
  }
  return data as RequestCatalogResponse;
}

/**
 * Submits a song request to Limbik Frequencies.
 */
export async function submitSongRequest(
  requestId: string
): Promise<{ success: boolean; message: string }> {
  const url = `${STATION_CONFIG.submitRequestBaseUrl}/${encodeURIComponent(requestId)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });

  let payload: { message?: string; formatted_message?: string } = {};
  try {
    payload = await response.json();
  } catch {
    // ignore JSON parse issues on empty bodies
  }

  const msg =
    payload.formatted_message ||
    payload.message ||
    (response.ok
      ? 'Track requested! It will play shortly on Limbik Frequencies.'
      : 'Could not submit request right now.');

  return {
    success: response.ok,
    message: msg,
  };
}
