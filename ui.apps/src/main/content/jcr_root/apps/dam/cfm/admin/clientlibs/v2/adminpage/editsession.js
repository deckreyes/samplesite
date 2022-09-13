/*************************************************************************
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2017 Adobe
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 *************************************************************************/

 (function($, ns, window) {
    'use strict';

    var isActive = false;
    var isTestingMode = false;
    var isReadOnly = false;
    var allowLockedEditing = false;
    var isDirty = false;

    var IS_PAGE_REF_UPDATE_REQUIRED = "cf-isPageRefUpdateRequired";

    var COOKIE_OPTS = {
        "path": Granite.HTTP.externalize("/")
    };

    function setTokenForPathname(pathname, token){
        var items = getBreadcrumb();
        if (items) {
            $.each(items, function(index, value) {
                if (value.pathname === pathname) {
                    value.token = token;
                }
            })
        }
        sessionStorage.setItem('cf-breadcrumb', JSON.stringify(items));
    };


    function getBreadcrumb() {
        return JSON.parse(sessionStorage.getItem('cf-breadcrumb'));
    }

    ns.Core.registerReadyHandler(function() {
        var $editorBase = $("#Editor");
        isReadOnly = $editorBase.data("is-read-only");

        if (isReadOnly && allowLockedEditing) {
            // adjust read-only mode if the rendering is "read only", but only because
            // of locking - and the editor allows for editing locked content
            var readOnlyMode = $editorBase.data("read-only-mode");
            if (readOnlyMode && (readOnlyMode.indexOf("locked") >= 0)
                    && (readOnlyMode.indexOf("permission") < 0)) {
                isReadOnly = false;
            }
        }

        ns.EditSession.fragment.urlBase = $editorBase.data("path");
        ns.EditSession.fragment.path = $editorBase.data("fragment");
        ns.EditSession.initialize();
        ns.RequestManager.setReadOnly(isReadOnly);
    }, 10);

    $(window).on("beforeunload", function() {
        if (isTestingMode) {
            return undefined;
        }
        if ((isActive && ns.EditSession.isDirty()) || ns.RequestManager.hasPendingRequests()) {
            return Granite.I18n.get("There are currently unsaved changes that will be lost if you leave the page now.");
        }
        return undefined;
    });


    // -------------------------------------------------------------------------------------
    // API: Edit session management

    var tokenPath = undefined;
    var token = undefined;

    function cleanUp() {
        $.removeCookie(ns.constants.EDIT_COOKIE_PATH, COOKIE_OPTS);
        $.removeCookie(ns.constants.EDIT_COOKIE_TOKEN, COOKIE_OPTS);
        token = undefined;
        tokenPath = undefined;
    }

    function cleanUpOldUse() {
        var data = {
            ":operation": "cancel",
            "token": token
        };
        ns.RequestManager.schedule({
            request: {
                url: tokenPath + ".cfm.edit.json",
                method: "post",
                dataType: "json",
                data: data
            },
            type: ns.RequestManager.REQ_SEQUENTIAL,
            condition: ns.RequestManager.COND_NONE
        });
        cleanUp();
    }

    ns.EditSession = {

        /**
         * Information about the fragment currently being edited
         */
        fragment: {
            urlBase: undefined,
            path: undefined,
            isReadOnly: undefined
        },

        initialize: function() {
            tokenPath = $.cookie(ns.constants.EDIT_COOKIE_PATH);
            token = $.cookie(ns.constants.EDIT_COOKIE_TOKEN);
            var requiresCleanUp =
                token && tokenPath && (tokenPath != ns.EditSession.fragment.urlBase);
            if (requiresCleanUp) {
                cleanUpOldUse(this);
            }
            if (token && tokenPath && !requiresCleanUp && !isReadOnly) {
                isActive = true;
                ns.RequestManager.notifyActiveEditSession();
            }
        },

        /**
         * Starts an editing session.
         *
         * <p>If the editing session is already available or requested, the call is
         * simply ignored.</p>
         *
         * @param callback (Optional) callback method
         * @param uiType (Optional) UI type for the request
         */
        start: function(callback, uiType) {
            if(isReadOnly) {
                return;
            }

            if (isActive) {
                return;
            }

            isActive = true;
            var data = {
                ":operation": "start"
            };

            var self = this;
            ns.RequestManager.schedule({
                request: {
                    url: self.fragment.urlBase + ".cfm.edit.json",
                    method: "post",
                    dataType: "json",
                    data: data
                },
                type: ns.RequestManager.REQ_EDITSESSION_STARTER,
                condition: ns.RequestManager.COND_NONE,
                ui: uiType,
                handlers: {
                    success: function(response) {
                        var data = response.data;
                        var isSuccess = false;
                        token = data.token;
                        tokenPath = self.fragment.urlBase;
                        if (token && tokenPath) {
                            setTokenForPathname(tokenPath, token);
                            $.cookie(ns.constants.EDIT_COOKIE_PATH, tokenPath, COOKIE_OPTS);
                            $.cookie(ns.constants.EDIT_COOKIE_TOKEN, token, COOKIE_OPTS);
                            ns.RequestManager.notifyActiveEditSession();
                            isSuccess = true;
                        }
                        if (callback) {
                            callback(isSuccess);
                        }
                    },
                    fail: function() {
                        if (callback) {
                            callback(false);
                        }
                        console.error("Could not create new version of the fragment.");
                    }
                }
            });
        },

        /**
         * "Commits" the changes to the fragment.
         *
         * @param callback (Optional) callback method
         * @param uiType (Optional) UI type for the request
         */
        commit: function(callback, uiType, shouldUpdatePageReferences) {
            if(isReadOnly) {
                return;
            }

            isActive = false;
            isDirty = false;
            var data = {
                ":operation": "apply",
                "shouldUpdatePageReferences": Boolean(shouldUpdatePageReferences)
            };

            var self = this;
            ns.RequestManager.schedule({
                request: {
                    url: self.fragment.urlBase + ".cfm.edit.json",
                    method: "post",
                    dataType: "json",
                    data: data
                },
                type: ns.RequestManager.REQ_BLOCKING,
                condition: ns.RequestManager.COND_EDITSESSION,
                ui: uiType || ns.RequestManager.UI_MASK_IMMEDIATELY,
                handlers: {
                    success: function() {
                        self.setPageRefUpdateRequired(!shouldUpdatePageReferences);
                        if (callback) {
                            callback(true);
                        }
                        cleanUp();
                        ns.RequestManager.notifyEditSessionClosed();
                    },
                    fail: function(response) {
                        if (callback) {
                            callback(false);
                        }
                        console.error("Could not commit changes.");
                        var jqXHR = response.jqXHR;
                        if (jqXHR && (jqXHR.invalidVersion || jqXHR.status === 500)) {
                            cleanUp();
                        }
                    },
                    beforeRequest: function() {
                        if (token) {
                            data.token = token;
                        }
                    }
                }
            });
            sessionStorage.removeItem('cf-breadcrumb');
        },

        /**
         * Cancels the changes to the fragment.
         *
         * @param callback (Optional) callback method
         * @param uiType (Optional) UI type for the request
         */
        rollback: function(callback, uiType) {
            if(isReadOnly) {
                return;
            }

            isActive = false;
            isDirty = false;
            var data = {
                ":operation": "cancel"
            };

            var self = this;
            ns.RequestManager.schedule({
                request: {
                    url: self.fragment.urlBase + ".cfm.edit.json",
                    method: "post",
                    dataType: "json",
                    data: data
                },
                type: ns.RequestManager.REQ_BLOCKING,
                condition: ns.RequestManager.COND_EDITSESSION,
                ui: uiType || ns.RequestManager.UI_MASK_IMMEDIATELY,
                handlers: {
                    success: function() {
                        ns.RequestManager.notifyEditSessionClosed();
                        cleanUp();
                        token = undefined;
                        tokenPath = undefined;
                        if (callback) {
                            callback(true);
                        }
                    },
                    fail: function(response) {
                        var jqXHR = response.jqXHR;
                        if (jqXHR && (jqXHR.invalidVersion || jqXHR.status === 500)) {
                            cleanUp();
                        }
                        if (callback) {
                            callback(false);
                        }
                    },
                    beforeRequest: function() {
                        if (token) {
                            data.token = token;
                        }
                    }
                }
            });
            sessionStorage.removeItem('cf-breadcrumb');
        },

        /**
         * Checks if the edit session has already been established.
         *
         * @returns {boolean} True if the edit session is available
         */
        isEstablished: function() {
            return isActive && _isEditSessionEstablished;
        },

        /**
         * Notifies the object about an active edit session "from the outside".
         *
         * <p>Use with care, as it might break the system if used improperly.</p>
         */
        notifyActiveSession: function() {
            isActive = true;
            ns.RequestManager.notifyActiveEditSession();
        },

        /**
         * Suspends the edit session "from the outside".
         *
         * <p>This should be called if the content is in a safe state and a navigation
         * needs to be executed without commiting/rolling back the session - to avoid
         * the warning message about leaving the page.</p>
         *
         * <p>Use with care, as it might break the system if used improperly.</p>
         */
        suspend: function() {
            isActive = false;
        },

        /**
         * Checks if the edit session is active.
         *
         * <p>Note that the edit session may be active, but not yet established (active
         * means: has been requested, whereas established means that the request has been
         * succeeded).</p>
         *
         * @returns {boolean} True if the edit session is active
         */
        isActive: function() {
            return isActive;
        },

        /**
         * Checks if the session token is available.
         *
         * <p>If a token is available, a session has been established (and is not just
         * active). It also means that the session is active.</p>
         *
         * @returns {boolean} True if the session token is available
         */
        hasToken: function() {
            return !!token;
        },

        /**
         * Enables testing mode.
         *
         * <p>In testing mode, the "leave page protection message" is suppressed.</p>
         */
        enableTestingMode: function() {
            isTestingMode = true;
        },

        /**
         * Enables editing locked content.
         *
         * <p>Due to how "locking" is intended to work for assets, some parts can
         * still be edited if the asset is locked. See
         * https://helpx.adobe.com/experience-manager/6-4/assets/using/check-out-and-submit-assets.html
         * </p>
         */
        enableLockedEditing: function() {
            allowLockedEditing = true;
        },

        /**
         * Checks if the session is dirty
         *
         * <p>A session is dirty if it has pending changes that need to be saved.</p>
         */
        isDirty: function() {
            return isDirty;
        },

        /**
         * Sets the dirty state of the session
         *
         * <p>A session becomes dirty if it has pending changes that need to be saved.</p>
         */
        setDirty: function (dirty) {
            isDirty = dirty;
        },

        /**
         * Set flag that indicates that page references update is required.
         * @param {boolean} isPageRefUpdateRequired
         */
        setPageRefUpdateRequired: function(isPageRefUpdateRequired) {
            if (isPageRefUpdateRequired) {
                sessionStorage.setItem(IS_PAGE_REF_UPDATE_REQUIRED, true);
            } else {
                sessionStorage.removeItem(IS_PAGE_REF_UPDATE_REQUIRED)
            }
        },

        /**
         * @returns {boolean} returns true if CF was saved but page references were not updated yet
         */
        isPageRefUpdateRequired: function() {
            return sessionStorage.getItem(IS_PAGE_REF_UPDATE_REQUIRED) === "true";
        },

        /**
         * Update page references
         * @param {(error?) => {}} callback
         */
        updatePageReferences: function(callback) {
            var self = this;
            $.ajax({
                url: this.fragment.urlBase + ".cfm.updatepagereferences.json",
                type: "POST",
                success: function() {
                    self.setPageRefUpdateRequired(false);
                    callback && callback();
                },
                error: function(err) {
                    callback && callback(err);
                }
            });
        }

    }

})($, window.Dam.CFM, window);
