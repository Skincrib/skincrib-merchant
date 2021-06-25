const io = require('socket.io-client');
const assert = require('assert');
const EventEmitter = require('events').EventEmitter;

const SKINCRIB_URL = 'https://skincrib.com/merchants';

module.exports = class SkincribMerchant extends EventEmitter{
    constructor({ key, reconnect } = {key: null, reconnect: false}){
        assert(key, '"key" parameter must be included to connect to Skincrib.');
        assert(typeof reconnect == Boolean, '"reconnect" parameter must be a boolean.');
        super();
        this.key = key; //api key
        this.reconnect = reconnect;
        this.authenticated = false;

        this.listings = [];
        this.market = {
            value: 0,
            max: 0
        }

        this.socket = io(SKINCRIB_URL, {
            transports: ['websocket'],
            upgrade: false
        });

        this.socket.on('connect', this.connected);
        this.socket.on('disconnect', this.disconnected);
        this.socket.on('error', this.error);

        this.socket.on('p2p:listings:new', this.listingAdded);
        this.socket.on('p2p:listings:removed', this.listingRemoved);
    }

    get marketValue(){
        return this.market.value / 100;
    }
    get marketMax(){
        return this.market.max / 100;
    }

    static connected(){
        return this.emit('connected', 'Connected to Skincrib websocket server.');
    }
    static disconnected(){
        this.authenticated = false;
        if(this.reconnect) this.authenticate();
        return this.emit('disconnected', 'Disconnected from Skincrib websocket server.');
    }
    static error(error){
        if(error.message) return this.emit('error', error.message);
        this.emit('error', error);
    }

    static listingAdded(listing){
        if(listing.price0 > this.market.max){
            this.market.max = listing.price;
        }
        this.listings.push(listing);
        this.emit('listing-added', listing);
    }
    static listingRemoved(assetid){
        let listing = this.listings.find(x => x.assetid == assetid);
        let index = this.listings.findIndex(x => x.assetid == assetid);

        if(index == -1) return;
        if(listing.price == this.market.max){
            this.market.max = Math.max.apply(Math, this.listings.map(x=> x.price ))
        }
        this.listings.splice(index, 1);
        this.market.value -= listing.price;

        this.emit('listing-removed', listing);
    }
    //authenticate to api
    authenticate(){
        return new Promise((res, rej)=>{
            this.socket.emit('authenticate', {key}, (err, data)=>{
                if(err){
                    return rej(err.message);
                }
                this.authenticated = true;
                this.emit('authenticated', 'Successfully connected to merchant socket.');
                return res(data.data);
            });
        });
    }
    //load client csgo inventory
    loadInventory(steamid){
        return new Promise((res, rej)=>{
            assert(steamid);
            assert(this.authenticated, 'You must authenticate to the websocket first.');

            this.socket.emit('user:loadInventory', {steamid}, (err, data)=>{
                if(err){
                    return rej(err.message);
                }
                return res(data.data.inventory);
            });
        });
    }
    //fetch all active listings on the market
    getListings(){
        return new Promise((res, rej)=>{
            assert(this.authenticated, 'You must authenticate to the websocket first.');

            this.socket.emit('p2p:listings:get', {}, (err, data)=>{
                if(err){
                    return rej(err.message);
                }
                this.listings = data.data;
                return res(data.data);
            });
        });
    }
}