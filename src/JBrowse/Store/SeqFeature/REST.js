define([
           'dojo/_base/declare',
           'dojo/_base/lang',
           'dojo/_base/array',
           'dojo/io-query',
           'dojo/request',
           'JBrowse/Store/LRUCache',
           'JBrowse/Store/SeqFeature',
           'JBrowse/Store/DeferredFeaturesMixin',
           'JBrowse/Store/DeferredStatsMixin',
           'JBrowse/Util',
           'JBrowse/Model/SimpleFeature'
       ],
       function(
           declare,
           lang,
           array,
           ioquery,
           dojoRequest,
           LRUCache,
           SeqFeatureStore,
           DeferredFeaturesMixin,
           DeferredStatsMixin,
           Util,
           SimpleFeature
       ) {

return declare( SeqFeatureStore,
{

    constructor: function( args ) {
        this.region_cache_hits = 0; //< stats mostly for unit tests

        // make sure the baseUrl has a trailing slash
        this.baseUrl = args.baseUrl || this.getConf('baseUrl');
        if( this.baseUrl.charAt( this.baseUrl.length-1 ) != '/' )
            this.baseUrl = this.baseUrl + '/';

    },

    configSchema: {
        slots: [
             { name: 'noCache',     type: 'boolean', defaultValue: false },
             { name: 'regionStats', type: 'boolean', defaultValue: false },
             { name: 'query', type: 'object', defaultValue: {} }
        ]
    },

    getRegionStats: function( query, successCallback, errorCallback ) {

        if( ! this.getConf('regionStats') ) {
            this._getRegionStats.apply( this, arguments );
            return;
        }

        query = this._assembleQuery( query );
        var url = this._makeURL( 'stats/region', query );
        this._get( { url: url, query: query, type: 'regionStats' }, successCallback, errorCallback );
    },

    getFeatures: function( query, featureCallback, endCallback, errorCallback ) {
        var thisB = this;
        query = this._assembleQuery( query );
        var url = this._makeURL( 'features', query );
        var cachedFeatureRegions;
        if( this.config.feature_range_cache
            && ! this.config.noCache
            && ( cachedFeatureRegions = this._getCachedFeatureRegions( query ) ) ) {
            this.region_cache_hits++;
            this._getFeaturesFromCachedRegions( cachedFeatureRegions, query, featureCallback, endCallback, errorCallback );
        }
        else {
            this._get( { url: url, query: query, type: 'features' },
                       dojo.hitch( this, '_makeFeatures',
                                   featureCallback, endCallback, errorCallback
                                 ),
                       errorCallback
                     );
        }
    },

    _getCachedFeatureRegions: function( query ) {
        function tilingIsComplete( regions, start, end ) {
            regions.sort( function(a,b) { return a.start - b.start; });
            var coverStart = regions[0].start,
                  coverEnd;
            for( var i = 0; i<regions.length; i++ ) {
                if( coverEnd === undefined || regions[i].start <= coverEnd && regions[i].end > coverEnd )
                    coverEnd = regions[i].end;
            }
            return coverStart <= start && coverEnd >= end;
        }

        function queriesMatch( q1, q2 ) {
            var keys = Util.dojof.keys( q1 ).concat( Util.dojof.keys( q2 ) );
            for( var k in q1 ) {
                if( k == 'start' || k == 'end' ) continue;
                if( q1[k] != q2[k] )
                    return false;
            }
            for( var k in q2 ) {
                if( k == 'start' || k == 'end' ) continue;
                if( q1[k] != q2[k] )
                    return false;
            }
            return true;
        }

        var relevantRegions = [];
        if( this._getCache().some(
                function( cacheRecord ) {
                    var cachedRequest = cacheRecord.value.request;
                    var cachedResponse = cacheRecord.value.response;
                    if( cachedRequest.type != 'features' || ! cachedResponse )
                        return false;
                    if( ! queriesMatch( cachedRequest.query, query ) )
                        return false;

                    // if( cacheRecord.query.start <= query.start && cacheRecord.query.end >= query.end ) {
                    //     relevantRegions = [cacheRecord];
                    //     return true;
                    // }
                    if( ! ( cachedRequest.query.end < query.start || cachedRequest.query.start > query.end ) ) {
                        relevantRegions.push( { features: cachedResponse.features, start: cachedRequest.query.start, end: cachedRequest.query.end });
                        if( tilingIsComplete( relevantRegions, query.start, query.end ) )
                            return true;
                    }
                    return false;
                },
                this )
          ) {
              return relevantRegions;
          }
        return null;
    },

    _getFeaturesFromCachedRegions: function( cachedFeatureRegions, query, featureCallback, endCallback, errorCallback ) {
        // gather and uniqify all the relevant feature data objects from the cached regions
        var seen = {};
        var featureData = [];
        array.forEach( cachedFeatureRegions, function( region ) {
            if( region && region.features ) {
                array.forEach( region.features, function( feature ) {
                    if( ! seen[ feature.uniqueID ] ) {
                        seen[feature.uniqueID] = true;
                        if( !( feature.start > query.end || feature.end < query.start ) )
                            featureData.push( feature );
                    }
                });
            }
        });

        // iterate over them and make feature objects from them
        this._makeFeatures( featureCallback, endCallback, errorCallback, { features: featureData } );
    },

    _getRegionFeatureDensities: function( query, histDataCallback, errorCallback ) {
        var url = this._makeURL( 'stats/regionFeatureDensities', this._assembleQuery( query ) );
        this._get( { url: url}, histDataCallback, errorCallback );

        // query like:
        //    { ref: 'ctgA, start: 123, end: 456, basesPerBin: 200 }
    //     // callback like:
    //     //   histDataCallback({
    //     //     "bins":  [ 51,50,58,63,57,57,65,66,63,61,56,49,50,47,39,38,54,41,50,71,61,44,64,60,42 ],
    //     //     "stats": { "basesPerBin":"200","max":88,"mean":57.772 } //< `max` used to set the Y scale
    //     //   });

    //     // or error like:
    //     //   errorCallback( 'aieeee i died' );
    // },
    },

    clearCache: function() {
        delete this._cache;
    },

    // HELPER METHODS
    _get: function( url, callback, errorCallback ) {

        if( this.getConf('noCache') )
            request( url, {
                         method: 'GET',
                         handleAs: 'json'
                     }).then(
                         callback,
                         this._errorHandler( errorCallback )
                     );
        else
            this._getCache().get( request, function( record, error ) {
                                      if( error )
                                          thisB._errorHandler(errorCallback)(error);
                                      else
                                          callback( record.response );
                                  });

    },

    _getCache: function() {
        var thisB = this;
        return this._cache || (
            this._cache = new LRUCache(
                {
                    name: 'REST data cache '+this.name,
                    maxSize: 25000, // cache up to about 5MB of data (assuming about 200B per feature)
                    sizeFunction: function( data ) { return data.length || 1; },
                    fillCallback: function( request, callback ) {
                        var get = dojoRequest( request.url, { method: 'GET', handleAs: 'json' },
                                               true // work around dojo/request bug
                                             );
                        get.then(
                            function(data) {
                                var nocacheResponse = /no-cache/.test(get.response.getHeader('Cache-Control'))
                                    || /no-cache/.test(get.response.getHeader('Pragma'));
                                callback({ response: data, request: request }, null, {nocache: nocacheResponse});
                            },
                            thisB._errorHandler( lang.partial( callback, null ) )
                        );
                    }
                }));
    },

    _errorHandler: function( handler ) {
        handler = handler || function(e) {
            console.error( e, e.stack );
            throw e;
        };
        return dojo.hitch( this, function( error ) {
            var httpStatus = ((error||{}).response||{}).status;
            if( httpStatus >= 400 ) {
                handler( "HTTP " + httpStatus + " fetching "+error.response.url+" : "+error.response.text );
            }
            else {
                handler( error );
            }
        });
    },

    _assembleQuery: function( query ) {
            return lang.mixin(
                { ref: (this.refSeq||{}).name },
                this.config.query || {},
                query || {}
            );
    },

    _makeURL: function( subpath, query ) {
        var url = this.baseUrl + subpath;

        if( query ) {
            if( query.ref ) {
                url += '/' + query.ref;
                query = lang.mixin({}, query );
                delete query.ref;
            }

            query = ioquery.objectToQuery( query );
            if( query )
                url += '?' + query;
        }

        return url;
    },

    _makeFeatures: function( featureCallback, endCallback, errorCallback, featureData ) {
        var features;
        if( featureData && ( features = featureData.features ) ) {
            for( var i = 0; i < features.length; i++ ) {
                featureCallback( this._makeFeature( features[i] ) );
            }
        }

        endCallback();
    },

    _parseInt: function( data ) {
        array.forEach(['start','end','strand'], function( field ) {
            if( field in data )
                data[field] = parseInt( data[field] );
        });
        if( 'score' in data )
            data.score = parseFloat( data.score );
        if( 'subfeatures' in data )
            for( var i=0; i<data.subfeatures.length; i++ )
                this._parseInt( data.subfeatures[i] );
    },

    _makeFeature: function( data, parent ) {
        this._parseInt( data );
        return new SimpleFeature( { data: data, parent: parent } );
    }
});
});