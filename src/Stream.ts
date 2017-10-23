import { EventEmitter } from 'events';
import { Channel } from './Channel';
import { RosException } from './RosException';
import * as debug from 'debug';

const info = debug('routeros-api:stream:info');
const error = debug('routeros-api:stream:error');

export class Stream extends EventEmitter {

    private channel: Channel;
    private params: string[];
    private callback: (err: Error, packet?: any) => void;

    private streaming: boolean = true;
    private pausing: boolean   = false;
    private paused: boolean    = false;
    private stopping: boolean  = false;
    private stopped: boolean   = false;

    constructor(channel: Channel, params: string[], callback?: (err: Error, packet?: any) => void) {
        super();
        this.channel  = channel;
        this.params   = params;
        this.callback = callback;

        this.channel.on('close', () => { this.stopped = false; });
        this.channel.on('stream', this.onStream());

        this.start();
    }

    public data(callback: (err: Error, packet?: any) => void): void {
        this.callback = callback;
    }

    public resume(): Promise<void> {
        if (this.stopped || this.stopping) return Promise.reject(new RosException('STREAMCLOSD'));

        if (!this.streaming) {
            this.pausing = false;
            this.start();
        }

        return Promise.resolve();
    }

    public pause(): Promise<void> {
        if (this.stopped || this.stopping) return Promise.reject(new RosException('STREAMCLOSD'));

        if (this.streaming) {
            this.pausing = true;
            return this.stop().then(() => {
                this.pausing = false;
                this.paused = true;
                return Promise.resolve();
            }).catch((err) => {
                return Promise.reject(err);
            });
        }

        return Promise.resolve();
    }

    public stop(): Promise<void> {
        if (this.stopped || this.stopping) return Promise.reject(new RosException('STREAMCLOSD'));
        if (!this.pausing) this.stopping = true;
        let chann = new Channel(this.channel.Connector);
        chann.on('close', () => { chann = null; });
        return chann.write(['/cancel', '=tag=' + this.channel.Id]).then(() => {
            this.streaming = false;
            if (!this.pausing) this.stopped = true;
            return Promise.resolve();
        }).catch((err: Error) => {
            return Promise.reject(err);
        });
    }

    public close(): Promise<void> {
        return this.stop();
    }

    private start(): void {
        if (!this.stopped && !this.stopping) {
            info('veio aqui');
            this.channel.write(this.params.slice(), true)
                .then(this.onDone())
                .catch(this.onTrap());
        }
    }

    private onStream(): (packet: any) => void {
        return (packet: any) => {
            if (this.callback) this.callback(null, packet);
        };
    }

    private onTrap(): (data: any) => void {
        return (data: any) => {
            if (this.channel) this.channel.close();
            if (data.category === 2 && data.message === 'interrupted') {
                this.streaming = false;
            } else {
                if (this.callback) this.callback(new Error(data.message));
            }
        };
    }

    private onDone(): () => void {
        return () => {
            if (this.channel) this.channel.close();
            if (!this.pausing)  this.stopped = false;
        };
    }
}