var ObjectId = require('mongoose').Schema.Types.ObjectId;

function makeRecordVote(votesName, votersName, weight) {
    weight = weight || 1;

    return function(objId, voterId, callback) {
        var q = {_id: objId};

        // only match if this voter hasn't already voted for this
        q[votersName] = {
            $ne: voterId
        };

        // adds voterId to the voters array
        var push = {};
        push[votersName] = voterId;
        
        // increments the vote count
        var inc = {};
        inc[votesName] = weight;

        var u = {
            $push: push,
            $inc: inc
        };

        this.update(q, u, callback);
    };
};

function makeCancelVote(votesName, votersName, weight) {
    weight = weight || 1;

    return function(objId, voterId, callback) {
        var q = {_id: objId};

        // only match if this voter has voted for this
        q[votersName] = voterId;

        // removes voterId from the voters array
        var pull = {};
        pull[votersName] = voterId;

        // decrements the vote count
        var inc = {};
        inc[votesName] = -weight;

        var u = {
            $pull: pull,
            $inc: inc
        };

        this.update(q, u, callback);
    };
};

module.exports = exports = function(schema, options) {
    options = options || {};

    var disableDownvotes = !!options.disableDownvotes;

    var tallyName = options.tallyName || 'votes';
    var voterIdType = options.voterIdType || ObjectId;

    var upvotesName = options.upvotesName || 'upvotes';
    var upvotersName = options.upvotersName || 'upvoters';

    var upvoteFuncName = options.upvoteFuncName || 'upvote';
    var cancelUpvoteFuncName = options.cancelUpvoteFuncName || 'cancelUpvote';

    // indexed defaults to false
    var indexed = !!options.indexed;

    var toAdd = {};
    toAdd[upvotesName] = {type: Number, default: 0};
    toAdd[upvotersName] = [voterIdType];

    if (!disableDownvotes) {
        var downvotesName = options.downvotesName || 'downvotes';
        var downvotersName = options.downvotersName || 'downvoters';
        toAdd[downvotesName] = {type: Number, default: 0};
        toAdd[downvotersName] = [voterIdType];
    }

    schema.add(toAdd);

    var upvoteFunc = makeRecordVote(upvotesName, upvotersName);
    var cancelUpvoteFunc = makeCancelVote(upvotesName, upvotersName);

    schema.statics[upvoteFuncName] = upvoteFunc;
    schema.statics[cancelUpvoteFuncName] = cancelUpvoteFunc;

    schema.methods[upvoteFuncName] = function(voterId, callback) {
        this.constructor[upvoteFuncName].call(this.constructor, this._id, voterId, callback);
    };

    schema.methods[cancelUpvoteFuncName] = function(voterId, callback) {
        this.constructor[cancelUpvoteFuncName].call(this.constructor, this._id, voterId, callback);
    };

    if (!disableDownvotes) {
        var downvoteFuncName = options.downvoteFuncName || 'downvote';
        var cancelDownvoteFuncName = options.cancelDownvoteFuncName || 'cancelDownvote';

        var downvoteFunc = makeRecordVote(downvotesName, downvotersName);
        var cancelDownvoteFunc = makeCancelVote(downvotesName, downvotersName);

        // Modify upvote function to cancel any downvotes first
        schema.statics[upvoteFuncName] = function(objId, voterId, callback) {
            var self = this;
            cancelDownvoteFunc.call(this, objId, voterId, function(err) {
                if (err) {
                    callback(err, null);
                } else {
                    upvoteFunc.call(self, objId, voterId, callback);
                }
            });
        };

        schema.statics[downvoteFuncName] = function(objId, voterId, callback) {
            var self = this;
            cancelUpvoteFunc.call(this, objId, voterId, function(err) {
                if (err) {
                    callback(err, null);
                } else {
                    downvoteFunc.call(self, objId, voterId, callback);
                }
            });
        };

        schema.statics[cancelDownvoteFuncName] = cancelDownvoteFunc;

        schema.methods[downvoteFuncName] = function(voterId, callback) {
            this.constructor[downvoteFuncName].call(this.constructor, this._id, voterId, callback);
        };

        schema.methods[cancelDownvoteFuncName] = function(voterId, callback) {
            this.constructor[cancelDownvoteFuncName].call(this.constructor, this._id, voterId, callback);
        };
    }

    var findUpvotesFuncName = options.findUpvotesFuncName || 'findUpvotes';
    schema.statics[findUpvotesFuncName] = function(voterId, q, callback) {
        if (!callback) {
            callback = q;
            q = {};
        }
        q[upvotersName] = voterId;
        projection = {
            _id: 1
        };
        this.find(q, projection, callback);
    };
    
    if (!disableDownvotes) {
        var findDownvotesFuncName = options.findDownvotesFuncName || 'findDownvotes';
        schema.statics[findDownvotesFuncName] = function(voterId, q, callback) {
            if (!callback) {
                callback = q;
                q = {};
            }
            q[downvotersName] = voterId;
            projection = {
                _id: 1
            };
            this.find(q, projection, callback);
        };
    }

    var highestVotedFuncName = options.highestVotedFuncName || 'highestVoted';
    schema.statics[highestVotedFuncName] = function(match, projection, sort, callback) {
        if (disableDownvotes) {
            projection[tallyName] = '$' + upvotesName;
        } else {
            projection[tallyName] = {
                $subtract: ['$' + upvotesName, '$' + downvotesName]
            };
        }
        sort = sort || {
            tallyName: -1
        };
        this.aggregate([
            {
                $match: match
            },
            {
                $project: projection
            },
            {
                $sort: sort
            },
            {
                $limit: 1
            }
        ], function(err, res) {
            if (err) {
                callback(err);
            } else if (res.length) {
                callback(null, res[0]);
            } else {
                callback(null, null);
            }
        });
    };

    // If the tally name (total count) is different from then upvoters
    // name then we'll add a virtual. If downvoting is enabled, the tally name
    // *must* be different from the upvoters name, otherwise this will not
    // work as intended
    if (tallyName !== upvotesName) {
        schema.virtual(tallyName).get(function() {
            if (disableDownvotes) {
                return this.upvotes;
            } else {
                return this.upvotes - this.downvotes;
            }
        });
    }

    if (indexed) {
        schema.index({'_id': 1, upvotersName: 1});
        if (!disableDownvotes) {
            schema.index({'_id': 1, downvotersName: 1});
        }
    }
};
