const io = require('socket.io-client');
const assert = require('assert');
const EventEmitter = require('events').EventEmitter;

const SKINCRIB_URL = 'https://skincrib.com/merchants';

module.exports = class SkincribMerchant extends EventEmitter{
    constructor({ key, reconnect, memory } = {key: null, reconnect: false, memory: false}){
        assert(key, '"key" parameter must be included to connect to Skincrib.');
        assert(typeof reconnect == Boolean, '"reconnect" parameter must be a boolean.');
        assert(typeof memory == Boolean, '"memory" parameter must be a boolean.');
        super();
        this.key = key; //api key
        this.reconnect = reconnect;
        this.memory = memory;
        this.authenticated = false;

        this.listings = [];
        this.market = {
            value: 0,
            max: 0
        }

        this.clients = {
            deposits: {
                'steamid': []
            },
            withdraws: {
                'steamid': []
            }
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
        this.socket.on('p2p:listings:status', this.listingStatus);
    }

    get marketValue(){
        return this.market.value / 100;
    }
    get marketMax(){
        return this.market.max / 100;
    }
    get getAllListingsFromMemory(){
        return this.listings;
    }
    get clientDeposits(steamid){
        return this.clients.deposits[steamid];

    }
    get clientWithdraws(steamid){
        return this.clients.withdraws[steamid];
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
        if(this.memory){
            if(listing.price > this.market.max){
                this.market.max = listing.price;
            }
            this.listings.push(listing);
        }
        
        this.emit('listing-added', listing);
    }
    static listingRemoved(assetid){
        if(this.memory){
            let listing = this.listings.find(x => x.assetid == assetid);
            let index = this.listings.findIndex(x => x.assetid == assetid);
    
            if(index == -1) return;
            if(listing.price == this.market.max){
                this.market.max = Math.max.apply(Math, this.listings.map(x=> x.price ))
            }
            this.listings.splice(index, 1);
            this.market.value -= listing.price;
        }

        this.emit('listing-removed', listing ? listing : assetid);
    }
    static listingStatus(listing){

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
    getAllListingsFromServer(){
        return new Promise((res, rej)=>{
            assert(this.authenticated, 'You must authenticate to the websocket first.');

            this.socket.emit('p2p:listings:get', {}, (err, data)=>{
                if(err){
                    return rej(err.message);
                }
                
                if(this.memory) this.listings = data.data;

                return res(data.data);
            });
        });
    }
    //create new listing on market
    createListing(steamid, apiKey, tradeUrl, items){
        return new Promise((res, rej)=>{
            assert(this.authenticated, 'You must authenticate to the websocket first.');
            assert(steamid, 'Provide a client\'s SteamID64.');
            assert(apiKey, 'Provide a client\'s Steam api-key.');
            assert(tradeUrl, 'Provide a client\'s Steam tradeurl.');
            assert((typeof items == Array && items.length > 0), 'Provide an array of at least one item object to list.');
            items.forEach((x, i) => assert((x.assetid && x.price && x.percentIncrease), `Item object index ${i} should contain a minimum of: assetid, price, percentIncrease.`));

            this.socket.emit('p2p:listings:new', {steamid, apiKey, tradeUrl, items}, (err, data)=>{
                if(err.message){
                    return rej(err.message);
                }
            });
        });
    }
    //cancel listing on market
    cancelListing(steamid, assetids){
        return new Promise((res, rej)=>{
            assert(this.authenticated, 'You must authenticate to the websocket first.');
            assert(steamid, 'Provide a client\'s SteamID64.');
            assert((typeof assetids == Array && assetids.length > 0), 'Provide an array of at least one assetid to cancel.');

            this.socket.emit('p2p:listings:cancel', {steamid, assetids}, (err, data)=>{
                if(err.message){
                    return rej(err.message);
                }
            });
        });
    }
}