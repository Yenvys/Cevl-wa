// plugins/downloader/pint.js

import fetch from 'node-fetch';
import { buildCarouselMessage, pickRandomPins } from '../../src/helper.js';

const logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.log
};

const getSetting = (key) => {
    if (key === 'prefix') return '.';
    return null;
};

const applyDisappearingMessage = (payload, message) => payload;

const PINTEREST_AUTH_COOKIE = process.env.PINTEREST_AUTH_COOKIE || 'ar_debug=1; csrftoken=fab48266540a21293ddafb736efb91c1; _auth=1; _b="AYmSnLqtglhMzbnRzRXR8W4si+wra6knjZ1qUVWNgURsmSOIZHt/4K6Vycm2oqtWpLg="; ar_debug=1; _pinterest_cm=TWc9PSZ1cTlBUnlkNU13VENzS1VTL0o3dG1CZTdSOG1uR0RaNXJJakpONUllQ0JHOFhEUjRtRnJZTjFqUXRaWXJQQ3RHTTIvcTVzOTdxRit0QU9hRVpLTloxR1l0K3FDU1dpRUw4eERBMHRQUmtEd1dLZzV4aWNUOFlSelRZL2NzL2F0UnpuSXJnM3RWV0Y1b2gyMnlyR0FjNENYU0J0V05SRTFHZ1VxdjRBbmdoTVpLdFZ0c3lEb1Y3bjFVZnAwaEt4TmomVS9OMFl1SW9YRmttdTZ0Vk85eG5LZHIrSlA0PQ==; _routing_id="f2bec2a1-968e-4e5a-b7b0-1c6c1e0c4e48"; sessionFunnelEventLogged=1; __Secure-s_a=ODltaW1TUTlZZzZOeXYxYUJZZHVIUERXd2s2ejNXOU5nYXlQOUpuSFBGUGFKbngwbHlxYmNvZ2ZYdU5VblVoSmp1NFA5dmZ5c2xURjFVaklFUkZaakNWTkpGaTYyWkFScXZ1UFVKL3VicVBhOHJoVHFhOXF0RE51RUJFYTczNXZRSVJMMTVLd0pBemZXRDFpVEpzVEczYzdMb3drNHpWdmpnL29nSGczci9LSnZMSExyd0RsMit0ZzQwaFliclF2dEs0LzRud1IzRG9naHRndURZUlRnMGlLZlc4NXNUbkFzKytodld2TjN0LzM0S25jbFUvK1FpWlRKWWtTUGlFbUJNNnRROUdsREl4YUJIMTVGMWw4ZVhaTUhvaUNGODQ2SkUvdVZiNURmK04yZ0pHSEk0eVpZaG1RdDg1NSttVVJHMDF1OUdFc240RGF2bkgyczZ3ZTdYV09aUEFtSno2MVJTdmFFRjFSQzZjNW1ZYnFmM3IydGlicUJrT2hxSVhTWDcvckpySjk4YS9mOTBWc3dBWGRaOGpEcnV1ZG1vNTV0eXNZNGZiV05rRmFHVlhGNXpqOUx4VlZYYkZsWkFVcUdSRFptdm13YUNvRXFXOTNGNWdzdVUxeDI2TEt1aGtUS1FjTG8rWG05OEZhVjJielU2VHVqeUc1MXJvMndQTmg2MlpOSWVZOUg4SDFQb253dVlQMkpTUGRVdU1ET0lqVnZtUy9aN0tkdkx1VnlDZWgwUjcxMFo2Uk44WWVsUUluZDhsOUw2WEoxMEEreWlKaDdPd0NXbFp6RFVDbWxmQ01tOGRjMkFGUXI2YVB4OGd2T0dLYVNmWE94UGZPcXFYMFUwOHljMkQ5MlZ0RXJxUkdFbnlSd0cxcjlEdGgwSFhpaE9ibFhneHVQWXQ1MDRkUW5ZOFVoWjVieTF6N2VNMDlyOVhVZXRmOGdrZXJ4T1B0VU5DcCtjdFpFV0VxcTNic1A2S29sWGdDUWtEUmtKQU5qdFYyWkRoZ1hESHhRVCs3SnRJREllRkpPdEc4cGliREN6QWhLMUh0bUFmb1VkYnQ1WDlZL0pnTzlSWm56UjkyQUtWY2h4K1NUMkJ5NFhMWjIvcnNZVm1MNVlCU2VFVGlYMkVMcmZEYmVIREdsZ0hKWW16WmJhNCt2ek9JVmV2MFRpeWR5Vm43bkVtTTc2bFQ2SmlLZUZtU0FtNkMwNmVueSsyMVRZM09YakJYckdPc3FUUEpTQ1JKOSs0ekowZm1PaFhCZm02SmtkbWNyVk9iMzZ0ZVZkeStTQ3JNK3ZUR0djM3cwT0owQ0xmQ2ZtYUFXVmNZeVJyeTBEb1Y3bjFVZnAwaEt4TmomVS9OMFl1SW9YRmttdTZ0Vk85eG5LZHIrSlA0PQ=="; _pinterest_sess=TWc9PSY1SGdaWFV3VWc3TGtNMGFWeHYvU0pWRWFuZ1lCZFJ4SnYyZmZMUFhIeldrT3JVSG5JYmRFaTlnNmd1blRJRk1Cbm9FVnJRR0U0R0NqSHB3a1FkY3o4UExDU2ZzTDB1R0NlWkh1MWdJbVowdUNmZ3h4a1V1V0Z0dVVjVk5mRjcwVlV4YmNlR2I0OWF2REd5U3k0aDRzR0V1UFlxT0h1dC94dkRVMUZZZk9Ua2QzZ2RCd09nZHhXb3J1Slp5RjhUVHo4NTNIbEh2UXA4aWM2Rml1c3Rxekhac3EzZzloK3dPS0hEdE5rVnpXcURlZWp2OGZYRVhNSW9KL1FJdjRMMXlENzBUbzVud09zKzNiOWFaSFo4TW9aY3hXbVR5Yk1CWFFLMTV0VEVrUStNanJhYitld3UrZHlGcmtQL1BnNmw3amRzeWllMm0rZWEwZUtPSGtZSlJZNDd5Mk5rc2YweFUrVXpPN1o0bCt3ODFJMHhwYzlmK2tqem5tcW91cXVWam85VjcrUzUvZ2hSNm1GUE1tV3I2VVNZSytMNlVndlkwOVA0MGttZk5JdFhGQzZTSElkMVJTUVVsNFhRT2N0WWpMSnZOVkwwK3NaelRNck8rdEdpcEVFUThIQWVTWkJBdjI1RjJVcTNrWUcrMndYTkpmTFBwV0dsNkdYOGx5ZEFKNWhuWkVwci9QR1FjdFRyNHFqRUszOUUrL2JTb05TSy9tTUNMb3Iza2VnbWxmOXJNUmlLTmRlUHl2MmxxemFJanU4Q2VlbDgwWGdWeUdBTmp4N29VdzJKT3BxRDZ5SWgzYW54YmhwRkNFNkdMVmFPa2YwQ3d0SVAvcGN2ZTRLZFl4WWhvYUU0RXdmSW54TVZTcTVTdFN5a1NtUGJjUC93R0dJK0RNNEttVi9NeWZNb1J3SFRta0FHK3hNczJqWDdIRm1tODN4eCtCSkpZcUd6SlB4V2Q2b0JjNmdtdXR2SERWcWJYblcxT2V1UXJtT00zU3NyRlRyRm9DWW1GVk8wWlF4UkhwMm83eGFhd0NMcm50bTVDa1krTi94L3AwbEJESVlKaHFtUjNqL0kvZWN6ckE3TUJXN2ZldEZNRnZOeldsSG1JeDJSM2ZEU25IcWVaMElJS3VveHZMd2xDTDFCOXZHZzZZTkwrWHZCTXlwbjVRUmtsNEdDSmtyOEVaVHFCUXRKbmpuY0VEM3J1V2Q5bjFuVHpCL1pTM3RUeFhReEU5Y3Q4OTgxK2pMRFZqdVZNN1JZM2VKOW5PMUhSR0F2YWNadElIVVEvQnFqWlVmNjJjVmdydzNKdzVINS9yaWdVMytMOWZqa1FlZUduUGF1U2srOTBwMVZPVk5RR0oxVFZMRE8rR1d3K3dBVS80QnFLUlR0TU9IOXkwMkptZk83Y1h3cExLbjY4S3ArSjhKUkNIdHBwSElmWVY4RXY5dUxpS3RIeFRmMlNoWEZyVGc4SHYxRnNYWFhNV3dIYm1DZWNTM1RKU096M2pqRXhQeEowZWRVTjVsOEc3MVhrYnJZc2hYZUlxU0p6RllQNlp1S1ZEdmFhTElRajYyWkFScXZ1UFVKL3VicVBhOHJoVHFhOXF0RE51RUJFYTczNXZRSVJMMTVLd0pBemZXRDFpVEpzVEczYzdMb3drNHpWdmpnL29nSGczci9LSnZMSExyd0RsMit0ZzQwaFliclF2dEs0LzRud1IzRG9naHRndURZUlRnMGlLZlc4NXNUbkFzKytodld2TjN0LzM0S25jbFUvK1FpWlRKWWtTUGlFbUJNNnRROUdsREl4YUJIMTVGMWw4ZVhaTUhvaUNGODQ2SkUvdVZiNURmK04yZ0pHSEk0eVpZaG1RdDg1NSttVVJHMDF1OUdFc240RGF2bkgyczZ3ZTdYV09aUEFtSno2MVJTdmFFRjFSQzZjNW1ZYnFmM3IydGlicUJrT2hxSVhTWDcvckpySjk4YS9mOTBWc3dBWGRaOGpEcnV1ZG1vNTV0eXNZNGZiV05rRmFHVlhGNXpqOUx4VlZYYkZsWkFVcUdSRFptdm13YUNvRXFXOTNGNWdzdVUxeDI2TEt1aGtUS1FjTG8rWG05OEZhVjJielU2VHVqeUc1MXJvMndQTmg2MlpOSWVZOUg4SDFQb253dVlQMkpTUGRVdU1ET0lqVnZtUy9aN0tkdkx1VnlDZWgwUjcxMFo2Uk44WWVsUUluZDhsOUw2WEoxMEEreWlKaDdPd0NXbFp6RFVDbWxmQ01tOGRjMkFGUXI2YVB4OGd2T0dLYVNmWE94UGZPcXFYMFUwOHljMkQ5MlZ0RXJxUkdFbnlSd0cxcjlEdGgwSFhpaE9ibFhneHVQWXQ1MDRkUW5ZOFVoWjVieTF6N2VNMDlyOVhVZXRmOGdrZXJ4T1B0VU5DcCtjdFpFV0VxcTNic1A2S29sWGdDUWtEUmtKQU5qdFYyWkRoZ1hESHhRVCs3SnRJREllRkpPdEc4cGliREN6QWhLMUh0bUFmb1VkYnQ1WDlZL0pnTzlSWm56UjkyQUtWY2h4K1NUMkJ5NFhMWjIvcnNZVm1MNVlCU2VFVGlYMkVMcmZEYmVIREdsZ0hKWW16WmJhNCt2ek9JVmV2MFRpeWR5Vm43bkVtTTc2bFQ2SmlLZUZtU0FtNkMwNmVueSsyMVRZM09YakJYckdPc3FUUEpTQ1JKOSs0ekowZm1PaFhCZm02SmtkbWNyVk9iMzZ0ZVZkeStTQ3JNK3ZUR0djM3cwT0owQ0xmQ2ZtYUFXVmNZeVJyeTBEb1Y3bjFVZnAwaEt4TmomVS9OMFl1SW9YRmttdTZ0Vk85eG5LZHIrSlA0PQ==";}";';


async function getPinterestImages(query, pageCount = 3, pageSize = 30) {

    if (!PINTEREST_AUTH_COOKIE || PINTEREST_AUTH_COOKIE.length < 50) {
        throw new Error("Cookie Pinterest belum diatur / tidak valid.");
    }

    const baseUrl = 'https://id.pinterest.com/resource/BaseSearchResource/get/';
    const headers = {
	    'X-Requested-With': 'XMLHttpRequest',
	    'Accept': 'application/json, text/javascript, */*; q=0.01',
	    'X-APP-VERSION': '16a3fa5',
	    'X-Pinterest-AppState': 'active',
	    'X-Pinterest-PWS-Handler': 'www/search/[scope].js',
	    'screen-dpr': '2.8',
	    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
	    'Referer': `https://id.pinterest.com/search/pins/?rs=typed&q=${encodeURIComponent(query)}`,
	    'Cookie': PINTEREST_AUTH_COOKIE,
	};

    let bookmark = null;
    let allPins = [];

	const encodedQuery = encodeURIComponent(query);

	for (let i = 0; i < pageCount; i++) {

	    const options = {
	        appliedProductFilters: '---',
	        auto_correction_disabled: false,
	        query: query,
    	    scope: 'pins',
    	    source_url: `/search/pins/?q=${encodedQuery}&rs=typed`,
    	    top_pin_id: null,
    	    page_size: pageSize,
    	    ...(bookmark && { bookmark })
    	};

    	const url = `${baseUrl}?source_url=/search/pins/?q=${encodedQuery}&rs=typed&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}&_=${Date.now()}`;

        logger.debug(`[Pinterest] Fetch: ${url}`);

        try {
            const res = await fetch(url, { headers });

            if (!res.ok) {
                throw new Error(`Status ${res.status}`);
            }

            const json = await res.json();

            const rawData = json.resource_response?.data?.results;
            bookmark = json.resource_response?.bookmark;

            if (!Array.isArray(rawData)) break;

            const pins = rawData.map(pin => ({
                image: pin.images?.['736x']?.url || pin.images?.orig?.url || null,
                link: pin.id ? `https://id.pinterest.com/pin/${pin.id}` : null
            })).filter(v => v.image);

            allPins.push(...pins);

            if (!bookmark) break;

        } catch (err) {
            throw new Error(`Fetch gagal: ${err.message}`);
        }
    }

    const unique = [...new Map(allPins.map(v => [v.image, v])).values()];
    logger.info(`[Pinterest] Total: ${unique.length}`);

    return unique;
}

const sentImageHistory = new Map();
const MAX_HISTORY_SIZE = 10;

function pickUniquePin(chatId, pins) {
    if (!sentImageHistory.has(chatId)) {
        sentImageHistory.set(chatId, new Set());
    }

    const historySet = sentImageHistory.get(chatId);

    const available = pins.filter(p => !historySet.has(p.image));

    let selected;

    if (available.length > 0) {
        selected = available[Math.floor(Math.random() * available.length)];
    } else {
        historySet.clear();
        selected = pins[Math.floor(Math.random() * pins.length)];
    }

    historySet.add(selected.image);

    if (historySet.size > MAX_HISTORY_SIZE) {
        const oldest = historySet.values().next().value;
        historySet.delete(oldest);
    }

    return selected;
}

export default {
    cmd: ['pinterest', 'pint'],
    category: 'search',

    async exec(m, { sock, args }) {
	    const chatId = m.from;
	    const query = args.join(' ').trim();
	
	    if (!query) {
	        return sock.sendMessage(chatId, {
	            text: `_Gambar apa yang ingin dicari?_\n_Cth: ${getSetting('prefix')}pin Elysia_`
	        }, { quoted: m });
	    }
	
	    if (!PINTEREST_AUTH_COOKIE || PINTEREST_AUTH_COOKIE.length < 50) {
	        await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
	        return sock.sendMessage(chatId, {
	            text: `Cookie Pinterest belum diatur`
	        }, { quoted: m });
	    }
	
	    await sock.sendMessage(chatId, { react: { text: "🔍", key: m.key } });
	
	    try {
		    const pins = await getPinterestImages(query, 1);
		    if (!pins.length) throw new Error("Tidak ditemukan");
		
		    const used = new Set();
		    const selectedPins = [];
		
		    while (selectedPins.length < 5 && used.size < pins.length) {
		        const pin = pickUniquePin(m.from, pins);
		        if (pin && !used.has(pin.image)) {
		            used.add(pin.image);
		            selectedPins.push(pin);
		        }
		    }

		    const carousel = await buildCarouselMessage(sock, m.from, selectedPins, query);

		    await sock.relayMessage(m.from, carousel.message, { 
		        messageId: carousel.key.id,
		        additionalNodes: [
		            {
		                tag: 'biz',
		                attrs: {},
		                content: [{
		                    tag: 'interactive',
		                    attrs: { type: 'native_flow', v: '1' },
		                    content: [{ tag: 'native_flow', attrs: { name: 'quick_reply' } }]
		                }]
		            }
		        ]
		    });

		    await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });

		} catch (err) {
	        await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });

        	await sock.sendMessage(chatId, {
            	text: `❌ ${err.message}`
        	}, { quoted: m });
    	}
	}
};