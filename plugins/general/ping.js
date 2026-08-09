/**
 * plugins/ping.js
 * Cek respon bot akurat tanpa spam chat
 */

import net from 'node:net';
import { performance } from 'node:perf_hooks';

export default {
    cmd: ['ping', 'p', 'tes'],
    category: 'system',
    exec: async (m, { sock }) => {
        const startNet = performance.now();
        
        // KONEKSI KE SERVER WA
        const checkNet = () => new Promise((resolve) => {
            const socket = new net.Socket(); 
            socket.setTimeout(2000);
            socket.connect(443, 'g.whatsapp.net', () => {
                const lat = performance.now() - startNet;
                socket.destroy();
                resolve(lat.toFixed(0));
            });
            socket.on('error', () => { socket.destroy(); resolve('Error'); });
            socket.on('timeout', () => { socket.destroy(); resolve('Timeout'); });
        });

        const netLatency = await checkNet();
        const startMsg = performance.now();
        const pingMsg = await sock.sendMessage(m.from, { 
            text: ` *Koneksi wea: ${netLatency}ms* \n *respon: Measuring..* `
        }, { quoted: m });

        const rtt = (performance.now() - startMsg).toFixed(0);

        await sock.sendMessage(m.from, {
            text: ` *Koneksi wea: ${netLatency}ms* \n *respon latency: ${rtt}ms* `,
            edit: pingMsg.key
        });
    }
};