var Service, Characteristic;
var request = require('request');
var dgram = require('dgram');

/**
 * @module homebridge
 * @param {object} homebridge Export functions required to create a
 *                            new instance of this plugin.
 */
module.exports = function(homebridge){
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('Homebridge-ESP', 'ESP-LED', ESP_LED);
};

/**
 * Parse the config and instantiate the object.
 *
 * @summary Constructor
 * @constructor
 * @param {function} log Logging function
 * @param {object} config Your configuration object
 */
function ESP_LED(log, config) {

    // The logging function is required if you want your function to output
    // any information to the console in a controlled and organized manner.
    this.log = log;

    this.service    = 'ESP LED Strip';
    this.name       = config.name;

    // UDP setup
    this.udpPort    = config.udpPort;
    this.host       = config.host;
    this.id         = config.id;

    this.baseURLget = "http://" + this.host + "/get?d=" + this.id + "&c=";
    this.baseURLset = "http://" + this.host + "/set?d=" + this.id + "&c=";
}

/**
*
* @augments ESP_RGB
*/
ESP_LED.prototype = {

    /** Required Functions **/
    identify: function(callback) {
        this.log('Identify requested!');
        callback();
    },

    getServices: function() {
        // You may OPTIONALLY define an information service if you wish to override
        // default values for devices like serial number, model, etc.
        var informationService = new Service.AccessoryInformation();

        informationService
        .setCharacteristic(Characteristic.Manufacturer, 'Espressif')
        .setCharacteristic(Characteristic.Model, 'ESP8266')
        .setCharacteristic(Characteristic.SerialNumber, 'Homebridge');

        this.log('Creating Lightbulb');
        var lightbulbService = new Service.Lightbulb(this.name);

        lightbulbService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

        // Handle HSV color components
        lightbulbService
        .addCharacteristic(new Characteristic.Hue())
        .on('get', this.getHue.bind(this))
        .on('set', this.setHue.bind(this));

        lightbulbService
        .addCharacteristic(new Characteristic.Saturation())
        .on('get', this.getSaturation.bind(this))
        .on('set', this.setSaturation.bind(this));

        lightbulbService
        .addCharacteristic(new Characteristic.Brightness())
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));

        this.log('Finished getting services')
        return [lightbulbService];
    },

    //** Custom Functions **//

    /**
     * Gets power state of lightbulb.
     *
     * @param {function} callback The callback that handles the response.
     */
    getPowerState: function(callback) {
        var url = this.baseURLget + 'e';
        this._httpRequest(url, '', 'GET', function(error, response, responseBody) {
            if (error) {
                callback(error);
            } else {
                var powerOn = parseInt(responseBody) > 0;
                callback(null, powerOn);
            }
        }.bind(this));
    },

    /**
     * Sets the power state of the lightbulb.
     *
     * @param {function} callback The callback that handles the response.
     */
    setPowerState: function(state, callback) {

        var url = this.baseURLset + (state ? "e" : "o");

        this._httpRequest(url, '', 'GET', function(error, response, responseBody) {
            if (error) {
                callback(error);
            } else {
                if (responseBody != 'ok') {
                    this.log("Unexpected response: " + responseBody);
                }
                callback(null);
            }
        }.bind(this));

        // Set the State via UDP
        // var payload = this._decToHex(this.id) + (state ? "FF" : "00");
        // this._sendUDP(payload, function (err) {
        //     callback(err);
        // });
    },

    /**
     * Gets brightness of lightbulb.
     *
     * @param {function} callback The callback that handles the response.
     */
    getBrightness: function(callback) {
        this._getParam('v', 100/255, callback);
    },

    /**
     * Sets the brightness of the lightbulb.
     *
     * @param {Number}   level    The brightness (0-360)
     * @param {function} callback The callback that handles the response.
     */
    setBrightness: function(level, callback) {
        this._setParamHTTP('v', level, 255/100, callback);
    },

    /**
     * Gets the hue of the lightbulb.
     *
     * @param {function} callback The callback that handles the response.
     */
    getHue: function(callback) {
        this._getParam('h', 360/255, callback);
    },

    /**
     * Sets the hue of the lightbulb.
     *
     * @param {Number}   level    The hue (0-360)
     * @param {function} callback The callback that handles the response.
     */
    setHue: function(level, callback) {
        this._setParamHTTP('h', level, 255/360, callback);
    },

    /**
     * Gets the saturation of the lightbulb.
     *
     * @param {function} callback The callback that handles the response.
     */
    getSaturation: function(callback) {
        this._getParam('s', 100/255, callback);
    },

    /**
     * Sets the saturation of the lightbulb.
     *
     * @param {number} level The saturation of the new call (0-100)
     * @param {function} callback The callback that handles the response.
     */
    setSaturation: function(level, callback) {
        this._setParamHTTP('s', level, 2.55, callback);
    },

    /** Utility Functions **/
    /**
     * Perform an HTTP request.
     *
     * @param {string} url URL to call.
     * @param {string} body Body to send.
     * @param {method} method Method to use.
     * @param {function} callback The callback that handles the response.
     */
    _httpRequest: function(url, body, method, callback) {
        request({
            url: url,
            body: body,
            method: method,
            rejectUnauthorized: false,
            auth: false
        },
        function(error, response, body) {
            callback(error, response, body);
        });
    },


    /**
    * Retrieves an int value according to the given url
    * from the device (0-255), and scales it with the given scale.
    *
    * @param  {String}   urlParam    The api url part
    * @param  {Number}   scale       The scaling factor
    * @param  {function} callback    The callback function
    */
    _getParam: function(urlParam, scale, callback) {
        var url = this.baseURLget + urlParam;
        this._httpRequest(url, '', 'GET', function(error, response, responseBody) {
            if (error) {
                callback(error);
            } else {
                var value = parseInt(responseBody);
                callback(null, Math.round(value * scale));
            }
        }.bind(this));
    },

    /**
    * Sets a value
    * from the device (0-255), and scales it with the given scale.
    *
    * @param  {String}   urlParam    The parameter type ('h': hue, 's': saturation, 'v': brightness)
    * @param  {Number}   value       The value of the parameter
    * @param  {Number}   scale       The scaling factor
    * @param  {function} callback    The callback function
    */
    _setParamHTTP: function(urlParam, value, scale, callback) {
        var scaled = Math.round(value * scale);
        var url = this.baseURLset + urlParam + '&v=' + this._decToHex(scaled);

        this._httpRequest(url, '', 'GET', function(error, response, responseBody) {
            if (error) {
                callback(error);
            } else {
                if (responseBody != 'ok') {
                    this.log("Unexpected response: " + responseBody);
                }
                callback(null);
            }
        }.bind(this));
    },

    /**
    * Sets a value
    * from the device (0-255), and scales it with the given scale.
    *
    * @param  {Number}   type        The parameter type (1: hue, 2: saturation, 3: brightness)
    * @param  {Number}   value       The value of the parameter
    * @param  {Number}   scale       The scaling factor
    * @param  {function} callback    The callback function
    */
    _setParamUDP: function(type, value, scale, callback) {
        var scaled = Math.round(value * scale);
        var payload = this._decToHex(this.id) + this._decToHex(type) + this._decToHex(scaled);
        this._sendUDP(payload, function (err) {
            callback(err);
        });
    },

    /**
     * Converts a decimal number into a hexidecimal string
     *
     * @param   {Number} d        Decimal number
     * @return  {String}          '0' padded hexidecimal number
     */
    _decToHex: function(d) {
        var hex = Number(d).toString(16).toUpperCase();
        if (hex.length < 2) {
            hex = '0' + hex;
        }
        return hex;
    },

    /**
     * Sends a payload via UDP to the device.
     *
     * @param   {String}   payload  The data as a hexadecimal string
     * @param  {function} callback  The callback function for errors
     */
    _sendUDP: function (payload, callback) {
        var message = new Buffer(payload, 'hex');

        var client = dgram.createSocket('udp4');

        setTimeout(function() {
            client.send(message, 0, message.length, this.udpPort, this.host, function(err, bytes) {
                if (err) throw err;
                client.close();

                callback(err);
            });
        }, 50);
    },

};
